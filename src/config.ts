import { readFileSync } from "node:fs";

const packageVersion = (
  JSON.parse(readFileSync(new URL("../package.json", import.meta.url), "utf8")) as {
    version: string;
  }
).version;

export interface Config {
  host: string;
  port: number;
  shutdownTimeoutMs: number;
  requestTimeoutMs: number;
  headersTimeoutMs: number;
  keepAliveTimeoutMs: number;
  maxBodyBytes: number;
  maxSumItems: number;
  version: string;
  gitTag: string;
  gitRevision: string;
}

function integer(
  env: NodeJS.ProcessEnv,
  name: string,
  fallback: number,
  minimum: number,
  maximum: number,
): number {
  const raw = env[name];
  if (raw === undefined) return fallback;
  if (!/^(0|[1-9]\d*)$/.test(raw)) {
    throw new Error(`${name} must be an integer from ${minimum} to ${maximum}.`);
  }
  const value = Number(raw);
  if (!Number.isSafeInteger(value) || value < minimum || value > maximum) {
    throw new Error(`${name} must be an integer from ${minimum} to ${maximum}.`);
  }
  return value;
}

export function loadConfig(env: NodeJS.ProcessEnv = process.env): Config {
  const host = env.HOST ?? "0.0.0.0";
  if (host.length === 0 || host.length > 253 || !/^[a-zA-Z0-9.:-]+$/.test(host)) {
    throw new Error("HOST must be a hostname or IP address.");
  }
  const requestTimeoutMs = integer(env, "REQUEST_TIMEOUT_MS", 30_000, 1, 600_000);
  const headersTimeoutMs = integer(env, "HEADERS_TIMEOUT_MS", 10_000, 1, 600_000);
  if (headersTimeoutMs > requestTimeoutMs) {
    throw new Error("HEADERS_TIMEOUT_MS must not exceed REQUEST_TIMEOUT_MS.");
  }
  const gitTag = env.GIT_TAG || "unknown";
  return {
    host,
    port: integer(env, "PORT", 3000, 0, 65_535),
    shutdownTimeoutMs: integer(env, "SHUTDOWN_TIMEOUT_MS", 10_000, 1, 600_000),
    requestTimeoutMs,
    headersTimeoutMs,
    keepAliveTimeoutMs: integer(env, "KEEP_ALIVE_TIMEOUT_MS", 5000, 1, 600_000),
    maxBodyBytes: integer(env, "MAX_BODY_BYTES", 16_384, 1, 1_048_576),
    maxSumItems: integer(env, "MAX_SUM_ITEMS", 1000, 1, 10_000),
    version: gitTag === "unknown" ? packageVersion : gitTag,
    gitTag,
    gitRevision: env.GIT_REVISION ?? "unknown",
  };
}
