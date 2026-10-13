import { randomUUID } from "node:crypto";
import type { IncomingMessage, ServerResponse } from "node:http";
import { createServer } from "node:http";
import type { AddressInfo } from "node:net";
import { CalculationError, calculator } from "./calculator.ts";
import type { Config } from "./config.ts";
import type { Log } from "./logger.ts";
import { createLogger } from "./logger.ts";
import { HttpProblem, sendJson, sendProblem } from "./problem.ts";

function invalid(detail: string): HttpProblem {
  return new HttpProblem(400, "invalid-input", "Invalid input", detail);
}

async function readBody(request: IncomingMessage, limit: number): Promise<unknown> {
  const contentType = request.headers["content-type"];
  if (!contentType || !/^application\/json(?:\s*;\s*charset=utf-8)?$/i.test(contentType)) {
    throw new HttpProblem(
      415,
      "unsupported-media-type",
      "Unsupported media type",
      "Use application/json.",
    );
  }
  if (request.headers["content-encoding"] !== undefined) {
    throw new HttpProblem(
      415,
      "unsupported-encoding",
      "Unsupported encoding",
      "Encoded bodies are not supported.",
    );
  }
  const declaredLength = request.headers["content-length"];
  if (declaredLength !== undefined && Number(declaredLength) > limit) {
    throw new HttpProblem(413, "body-too-large", "Body too large", `Body limit is ${limit} bytes.`);
  }
  const chunks: Buffer[] = [];
  let bytes = 0;
  for await (const chunk of request.iterator({ destroyOnReturn: false })) {
    bytes += chunk.length;
    if (bytes > limit) {
      throw new HttpProblem(
        413,
        "body-too-large",
        "Body too large",
        `Body limit is ${limit} bytes.`,
      );
    }
    chunks.push(chunk);
  }
  try {
    // Fatal UTF-8 decoding avoids silently replacing malformed input.
    return JSON.parse(
      new TextDecoder("utf-8", { fatal: true, ignoreBOM: true }).decode(Buffer.concat(chunks)),
    );
  } catch {
    throw invalid("Body must be valid UTF-8 JSON.");
  }
}

function object(body: unknown, keys: string[]): Record<string, unknown> {
  if (body === null || typeof body !== "object" || Array.isArray(body)) {
    throw invalid("Body must be a JSON object.");
  }
  const actual = Object.keys(body);
  if (actual.length !== keys.length || !keys.every((key) => actual.includes(key))) {
    throw invalid(`Body must contain exactly: ${keys.join(", ")}.`);
  }
  return body as Record<string, unknown>;
}

function number(value: unknown): number {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    throw invalid("Operands must be finite JSON numbers.");
  }
  return value;
}

export function createService(config: Config, log: Log = createLogger()) {
  let draining = false;
  let stopping: Promise<boolean> | undefined;

  async function handle(request: IncomingMessage, response: ServerResponse): Promise<void> {
    const suppliedId = request.headers["x-request-id"];
    const requestId =
      typeof suppliedId === "string" && /^[a-zA-Z0-9._-]{1,64}$/.test(suppliedId)
        ? suppliedId
        : randomUUID();
    response.setHeader("x-request-id", requestId);
    const started = performance.now();
    response.once("finish", () => {
      log("request", {
        requestId,
        method: request.method,
        status: response.statusCode,
        durationMs: Math.round(performance.now() - started),
      });
    });
    try {
      if (draining) {
        throw new HttpProblem(
          503,
          "unavailable",
          "Service unavailable",
          "The service is draining.",
        );
      }
      const path = new URL(request.url ?? "/", "http://localhost").pathname;
      const getRoutes = ["/healthz", "/readyz", "/version"];
      const postRoutes = ["/api/v1/add", "/api/v1/sum"];
      if (!getRoutes.includes(path) && !postRoutes.includes(path)) {
        throw new HttpProblem(404, "not-found", "Not found", "No route matches this request.");
      }
      const method = getRoutes.includes(path) ? "GET" : "POST";
      if (request.method !== method) {
        response.setHeader("allow", method);
        throw new HttpProblem(405, "method-not-allowed", "Method not allowed", `Use ${method}.`);
      }
      if (path === "/healthz" || path === "/readyz") {
        sendJson(response, 200, { status: path === "/healthz" ? "ok" : "ready" });
      } else if (path === "/version") {
        sendJson(response, 200, {
          version: config.version,
          gitTag: config.gitTag,
          gitRevision: config.gitRevision,
        });
      } else {
        const body = await readBody(request, config.maxBodyBytes);
        let result: number;
        if (path === "/api/v1/add") {
          const values = object(body, ["a", "b"]);
          result = calculator.add(number(values.a), number(values.b));
        } else {
          const values = object(body, ["numbers"]);
          if (!Array.isArray(values.numbers) || values.numbers.length === 0) {
            throw invalid("numbers must be a nonempty array.");
          }
          if (values.numbers.length > config.maxSumItems) {
            throw new HttpProblem(
              413,
              "too-many-items",
              "Too many items",
              `Item limit is ${config.maxSumItems}.`,
            );
          }
          result = calculator.sum(values.numbers.map(number));
        }
        sendJson(response, 200, { result });
      }
    } catch (error) {
      let problem: HttpProblem;
      if (error instanceof HttpProblem) {
        problem = error;
      } else if (error instanceof CalculationError) {
        problem = new HttpProblem(422, error.kind, "Calculation failed", error.message);
      } else {
        log("request_error", { requestId });
        problem = new HttpProblem(
          500,
          "internal-error",
          "Internal server error",
          "The request could not be completed.",
        );
      }
      if (!response.destroyed) sendProblem(response, problem, requestId);
    } finally {
      // Consume rejected bodies so keep-alive requests cannot retain unread input.
      request.resume();
    }
  }

  const server = createServer((request, response) => {
    void handle(request, response);
  });
  server.requestTimeout = config.requestTimeoutMs;
  server.headersTimeout = config.headersTimeoutMs;
  server.keepAliveTimeout = config.keepAliveTimeoutMs;

  return {
    server,
    get draining() {
      return draining;
    },
    start(): Promise<AddressInfo> {
      return new Promise((resolve, reject) => {
        server.once("error", reject);
        server.listen(config.port, config.host, () => {
          server.removeListener("error", reject);
          resolve(server.address() as AddressInfo);
        });
      });
    },
    stop(): Promise<boolean> {
      if (stopping) return stopping;
      draining = true;
      stopping = new Promise((resolve) => {
        const deadline = setTimeout(() => {
          server.closeAllConnections();
          resolve(false);
        }, config.shutdownTimeoutMs);
        server.close(() => {
          clearTimeout(deadline);
          resolve(true);
        });
      });
      return stopping;
    },
  };
}
