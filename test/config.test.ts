import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { loadConfig } from "../src/config.ts";

const packageVersion = (
  JSON.parse(readFileSync(new URL("../package.json", import.meta.url), "utf8")) as {
    version: string;
  }
).version;

describe("configuration", () => {
  it("provides bounded defaults", () => {
    expect(loadConfig({})).toEqual({
      host: "0.0.0.0",
      port: 3000,
      shutdownTimeoutMs: 10_000,
      requestTimeoutMs: 30_000,
      headersTimeoutMs: 10_000,
      keepAliveTimeoutMs: 5000,
      maxBodyBytes: 16_384,
      maxSumItems: 1000,
      version: packageVersion,
      gitTag: "unknown",
      gitRevision: "unknown",
    });
  });

  it("accepts explicit settings including an ephemeral port", () => {
    expect(
      loadConfig({
        HOST: "::1",
        PORT: "0",
        SHUTDOWN_TIMEOUT_MS: "20",
        REQUEST_TIMEOUT_MS: "200",
        HEADERS_TIMEOUT_MS: "100",
        KEEP_ALIVE_TIMEOUT_MS: "50",
        MAX_BODY_BYTES: "1024",
        MAX_SUM_ITEMS: "2",
        GIT_TAG: "v9.8.7",
        GIT_REVISION: "abc123",
      }),
    ).toEqual({
      host: "::1",
      port: 0,
      shutdownTimeoutMs: 20,
      requestTimeoutMs: 200,
      headersTimeoutMs: 100,
      keepAliveTimeoutMs: 50,
      maxBodyBytes: 1024,
      maxSumItems: 2,
      version: "v9.8.7",
      gitTag: "v9.8.7",
      gitRevision: "abc123",
    });
  });

  it.each(["", " 1", "1 ", "+1", "-1", "1.5", "1e3", "0x50", "NaN", "65536", "999999999999999999"])(
    "rejects invalid PORT %j",
    (PORT) => {
      expect(() => loadConfig({ PORT })).toThrow("PORT must be an integer");
    },
  );

  it.each(["", " host", "http://localhost", "host/name", "a".repeat(254)])(
    "rejects invalid HOST %j",
    (HOST) => {
      expect(() => loadConfig({ HOST })).toThrow("HOST");
    },
  );

  it.each([
    "SHUTDOWN_TIMEOUT_MS",
    "REQUEST_TIMEOUT_MS",
    "HEADERS_TIMEOUT_MS",
    "KEEP_ALIVE_TIMEOUT_MS",
    "MAX_BODY_BYTES",
    "MAX_SUM_ITEMS",
  ])("rejects disabled %s", (key) => {
    expect(() => loadConfig({ [key]: "0" })).toThrow(key);
    expect(() => loadConfig({ [key]: "9999999" })).toThrow(key);
  });

  it("rejects a header timeout longer than the request timeout", () => {
    expect(() => loadConfig({ REQUEST_TIMEOUT_MS: "100" })).toThrow("must not exceed");
  });

  it("can read process environment", () => {
    expect(loadConfig().port).toBeGreaterThanOrEqual(0);
  });

  it.each(["", "unknown"])(
    "uses the manifest version for an unspecified build tag %j",
    (GIT_TAG) => {
      expect(loadConfig({ GIT_TAG }).version).toBe(packageVersion);
      expect(loadConfig({ GIT_TAG }).gitTag).toBe("unknown");
    },
  );
});
