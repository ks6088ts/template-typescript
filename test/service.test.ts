import { once } from "node:events";
import { request } from "node:http";
import { createConnection } from "node:net";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { calculator } from "../src/calculator.ts";
import { loadConfig } from "../src/config.ts";
import { createService } from "../src/service.ts";

describe("HTTP service", () => {
  let service: ReturnType<typeof createService>;
  let base: string;
  let events: { event: string; fields: Record<string, unknown> | undefined }[];

  beforeEach(async () => {
    events = [];
    service = createService(
      loadConfig({ HOST: "127.0.0.1", PORT: "0", MAX_BODY_BYTES: "256", MAX_SUM_ITEMS: "3" }),
      (event, fields) => events.push({ event, fields }),
    );
    const address = await service.start();
    base = `http://127.0.0.1:${address.port}`;
  });

  afterEach(async () => {
    vi.restoreAllMocks();
    await service.stop();
  });

  async function post(path: string, body: unknown, headers: Record<string, string> = {}) {
    const response = await fetch(`${base}${path}`, {
      method: "POST",
      headers: { "content-type": "application/json", ...headers },
      body: JSON.stringify(body),
    });
    const json = (await response.json()) as Record<string, unknown>;
    return { response, json };
  }

  it.each([
    ["/healthz", { status: "ok" }],
    ["/readyz", { status: "ready" }],
    [
      "/version",
      {
        version: loadConfig({}).version,
        gitTag: "unknown",
        gitRevision: "unknown",
      },
    ],
  ])("serves %s", async (path, body) => {
    const response = await fetch(`${base}${path}`);
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual(body);
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(response.headers.get("x-content-type-options")).toBe("nosniff");
    expect(response.headers.get("x-request-id")).toMatch(/^[a-f0-9-]{36}$/);
    expect(events.at(-1)).toMatchObject({
      event: "request",
      fields: { method: "GET", status: 200 },
    });
  });

  it("calculates addition and bounded sums", async () => {
    expect((await post("/api/v1/add", { a: -2.5, b: 3 })).json).toEqual({ result: 0.5 });
    expect((await post("/api/v1/sum", { numbers: [1, -2, 3] })).json).toEqual({ result: 2 });
  });

  it("reports injected release provenance without hardcoding the package version", async () => {
    await service.stop();
    const config = loadConfig({
      HOST: "127.0.0.1",
      PORT: "0",
      GIT_TAG: "v9.8.7",
      GIT_REVISION: "abc123",
    });
    service = createService(config, () => {});
    const address = await service.start();
    const response = await fetch(`http://127.0.0.1:${address.port}/version`);
    expect(await response.json()).toEqual({
      version: config.version,
      gitTag: "v9.8.7",
      gitRevision: "abc123",
    });
  });

  it("returns RFC 9457 problems for absent routes", async () => {
    const response = await fetch(`${base}/missing`);
    const body = await response.json();
    expect(response.status).toBe(404);
    expect(response.headers.get("content-type")).toContain("application/problem+json");
    expect(body).toEqual({
      type: "urn:template-typescript:problem:not-found",
      title: "Not found",
      status: 404,
      detail: expect.any(String),
      requestId: response.headers.get("x-request-id"),
    });
  });

  it.each([
    ["/healthz", "POST", "GET"],
    ["/api/v1/add", "GET", "POST"],
  ])("advertises allowed methods for %s", async (path, method, allow) => {
    const response = await fetch(`${base}${path}`, { method });
    expect(response.status).toBe(405);
    expect(response.headers.get("allow")).toBe(allow);
    expect(await response.json()).toMatchObject({ status: 405 });
  });

  it.each([
    null,
    [],
    42,
    { a: 1 },
    { a: 1, b: 2, extra: 3 },
    { a: "1", b: 2 },
    { a: true, b: 2 },
    { a: null, b: 2 },
  ])("rejects invalid addition body %j", async (body) => {
    const result = await post("/api/v1/add", body);
    expect(result.response.status).toBe(400);
    expect(result.json.type).toContain("invalid-input");
  });

  it.each([{ numbers: [] }, { numbers: "1" }, { numbers: [1, "2"] }, { numbers: [null] }])(
    "rejects invalid sum %j",
    async (body) => {
      expect((await post("/api/v1/sum", body)).response.status).toBe(400);
    },
  );

  it("enforces the sum item limit", async () => {
    const result = await post("/api/v1/sum", { numbers: [1, 2, 3, 4] });
    expect(result.response.status).toBe(413);
    expect(result.json.type).toContain("too-many-items");
  });

  it("rejects overflow without serializing Infinity to null", async () => {
    const result = await post("/api/v1/add", { a: Number.MAX_VALUE, b: Number.MAX_VALUE });
    expect(result.response.status).toBe(422);
    expect(result.json.type).toContain("overflow");
  });

  it.each(["", "{", '{"a":1,"b":1e999}', '{"a":01,"b":2}', '{"a":1,"b":2} trailing'])(
    "strictly parses JSON %j",
    async (body) => {
      const response = await fetch(`${base}/api/v1/add`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body,
      });
      expect(response.status).toBe(400);
      await response.json();
    },
  );

  it("rejects malformed UTF-8", async () => {
    const response = await fetch(`${base}/api/v1/add`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: Buffer.from([0xff]),
    });
    expect(response.status).toBe(400);
    await response.json();
  });

  it("rejects a BOM rather than accepting non-JSON framing", async () => {
    const response = await fetch(`${base}/api/v1/add`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: Buffer.concat([Buffer.from([0xef, 0xbb, 0xbf]), Buffer.from('{"a":1,"b":2}')]),
    });
    expect(response.status).toBe(400);
    await response.json();
  });

  it.each(["text/plain", "application/json; charset=iso-8859-1"])(
    "rejects unsupported media type %s",
    async (contentType) => {
      const result = await post("/api/v1/add", { a: 1, b: 2 }, { "content-type": contentType });
      expect(result.response.status).toBe(415);
      expect(result.json.type).toContain("unsupported-media-type");
    },
  );

  it("rejects missing content type and encoded bodies", async () => {
    const response = await fetch(`${base}/api/v1/add`, { method: "POST" });
    expect(response.status).toBe(415);
    await response.json();
    const encoded = await post("/api/v1/add", { a: 1, b: 2 }, { "content-encoding": "gzip" });
    expect(encoded.response.status).toBe(415);
    expect(encoded.json.type).toContain("unsupported-encoding");
  });

  it("accepts JSON with a UTF-8 charset", async () => {
    const result = await post(
      "/api/v1/add",
      { a: 1, b: 2 },
      { "content-type": "application/json; charset=utf-8" },
    );
    expect(result.json).toEqual({ result: 3 });
  });

  it("enforces content-length limits", async () => {
    const result = await post("/api/v1/add", { padding: "x".repeat(300) });
    expect(result.response.status).toBe(413);
    expect(result.json.type).toContain("body-too-large");
  });

  it("enforces streamed limits without dropping the problem response", async () => {
    const result = await new Promise<{ status: number | undefined; body: string }>(
      (resolve, reject) => {
        const client = request(
          `${base}/api/v1/add`,
          { method: "POST", headers: { "content-type": "application/json" } },
          (response) => {
            let body = "";
            response.setEncoding("utf8");
            response.on("data", (chunk) => {
              body += chunk;
            });
            response.on("end", () => resolve({ status: response.statusCode, body }));
            response.on("error", reject);
          },
        );
        client.on("error", reject);
        client.write("x".repeat(200));
        client.end("y".repeat(200));
      },
    );
    expect(result.status).toBe(413);
    expect(JSON.parse(result.body).type).toContain("body-too-large");
  });

  it("preserves only safe bounded request IDs", async () => {
    const safe = await post("/api/v1/add", { a: 1, b: 2 }, { "x-request-id": "request_1.a-b" });
    expect(safe.response.headers.get("x-request-id")).toBe("request_1.a-b");
    for (const id of ["a b", "x".repeat(65), "bad/id"]) {
      const response = await fetch(`${base}/missing`, { headers: { "x-request-id": id } });
      expect(response.headers.get("x-request-id")).toMatch(/^[a-f0-9-]{36}$/);
      expect(await response.json()).not.toMatchObject({ requestId: id });
    }
  });

  it("does not leak unexpected exception details", async () => {
    vi.spyOn(calculator, "add").mockImplementationOnce(() => {
      throw new Error("private-secret");
    });
    const result = await post("/api/v1/add", { a: 1, b: 2 });
    expect(result.response.status).toBe(500);
    expect(JSON.stringify(result.json)).not.toContain("private-secret");
    expect(events.some(({ event }) => event === "request_error")).toBe(true);
  });

  it("sets explicit HTTP timeouts", () => {
    expect(service.server.requestTimeout).toBe(30_000);
    expect(service.server.headersTimeout).toBe(10_000);
    expect(service.server.keepAliveTimeout).toBe(5000);
  });

  it("finishes in-flight requests while rejecting pipelined requests during draining", async () => {
    const address = service.server.address();
    if (address === null || typeof address === "string") throw new Error("No bound TCP address");
    const socket = createConnection(address.port, "127.0.0.1");
    let data = "";
    socket.setEncoding("utf8");
    socket.on("data", (chunk) => {
      data += chunk;
    });
    socket.on("error", () => {});
    try {
      await once(socket, "connect");
      const incoming = once(service.server, "request");
      socket.write(
        'POST /api/v1/add HTTP/1.1\r\nHost: localhost\r\nContent-Type: application/json\r\nContent-Length: 13\r\n\r\n{"a":1,',
      );
      await incoming;
      const stopping = service.stop();
      expect(service.draining).toBe(true);
      expect(service.stop()).toBe(stopping);
      socket.write('"b":2}GET /readyz HTTP/1.1\r\nHost: localhost\r\nConnection: close\r\n\r\n');
      await once(socket, "close");
      expect(await stopping).toBe(true);
      expect(data).toContain('{"result":3}');
      expect(data).toContain("503 Service Unavailable");
      expect(data).toContain("service is draining");
    } finally {
      socket.destroy();
    }
  });

  it("forcibly closes active connections at the shutdown deadline", async () => {
    await service.stop();
    service = createService(
      loadConfig({ HOST: "127.0.0.1", PORT: "0", SHUTDOWN_TIMEOUT_MS: "30" }),
      () => {},
    );
    const address = await service.start();
    const socket = createConnection(address.port, "127.0.0.1");
    socket.on("error", () => {});
    try {
      await once(socket, "connect");
      const incoming = once(service.server, "request");
      socket.write(
        "POST /api/v1/add HTTP/1.1\r\nHost: localhost\r\nContent-Type: application/json\r\nContent-Length: 100\r\n\r\n{",
      );
      await incoming;
      expect(await service.stop()).toBe(false);
      await once(socket, "close");
    } finally {
      socket.destroy();
    }
  });

  it("rejects listen failures and cleans up safely", async () => {
    const address = service.server.address();
    if (address === null || typeof address === "string") throw new Error("No bound TCP address");
    const other = createService(
      loadConfig({ HOST: "127.0.0.1", PORT: String(address.port) }),
      () => {},
    );
    try {
      await expect(other.start()).rejects.toMatchObject({ code: "EADDRINUSE" });
    } finally {
      await other.stop();
    }
  });
});
