import type { ChildProcess } from "node:child_process";
import { spawn } from "node:child_process";
import { once } from "node:events";
import { request } from "node:http";
import { createServer } from "node:net";
import { afterEach, describe, expect, it, vi } from "vitest";

describe("actual entrypoints", () => {
  const children = new Set<ChildProcess>();

  afterEach(async () => {
    for (const child of children) {
      if (child.exitCode === null && child.signalCode === null) {
        const closed = once(child, "close");
        child.kill("SIGKILL");
        await closed;
      }
    }
    children.clear();
  });

  function launch(path: string, args: string[] = [], env: NodeJS.ProcessEnv = {}) {
    const child = spawn(process.execPath, [path, ...args], {
      env: {
        ...process.env,
        HOST: "127.0.0.1",
        PORT: "0",
        SHUTDOWN_TIMEOUT_MS: "500",
        REQUEST_TIMEOUT_MS: "30000",
        HEADERS_TIMEOUT_MS: "10000",
        KEEP_ALIVE_TIMEOUT_MS: "5000",
        MAX_BODY_BYTES: "16384",
        MAX_SUM_ITEMS: "1000",
        GIT_TAG: "v9.8.7",
        GIT_REVISION: "abc123",
        ...env,
      },
      stdio: ["ignore", "pipe", "pipe"],
    });
    children.add(child);
    let stdout = "";
    let stderr = "";
    child.stdout?.on("data", (chunk) => {
      stdout += chunk.toString();
    });
    child.stderr?.on("data", (chunk) => {
      stderr += chunk.toString();
    });
    const closed = once(child, "close");
    return { child, closed, stdout: () => stdout, stderr: () => stderr };
  }

  it.each(["SIGTERM", "SIGINT"] as const)(
    "serves requests and exits cleanly on %s",
    async (signal) => {
      const process = launch("src/main.ts");
      await vi.waitFor(
        () => {
          expect(process.stdout()).toContain('"event":"listening"');
        },
        { timeout: 5000 },
      );
      const started = JSON.parse(process.stdout().split("\n")[0] as string);
      const response = await fetch(`http://127.0.0.1:${started.port}/api/v1/add`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: '{"a":2,"b":3}',
      });
      expect(await response.json()).toEqual({ result: 5 });
      const metadata = await fetch(`http://127.0.0.1:${started.port}/version`);
      expect(await metadata.json()).toMatchObject({
        version: expect.stringMatching(/^\d+\.\d+\.\d+/),
        gitTag: "v9.8.7",
        gitRevision: "abc123",
      });
      process.child.kill(signal);
      expect(await process.closed).toEqual([0, null]);
      expect(process.stdout()).toContain('"event":"shutdown_complete"');
      expect(process.stdout()).toContain('"graceful":true');
      expect(process.stderr()).toBe("");
    },
  );

  it("fails fast on invalid configuration", async () => {
    const process = launch("src/main.ts", [], { PORT: "not-a-port" });
    expect(await process.closed).toEqual([1, null]);
    expect(JSON.parse(process.stdout()).event).toBe("startup_failed");
    expect(process.stdout()).toContain("INVALID_CONFIG");
  });

  it("enforces the actual process shutdown deadline", async () => {
    const process = launch("src/main.ts", [], { SHUTDOWN_TIMEOUT_MS: "50" });
    await vi.waitFor(() => expect(process.stdout()).toContain('"event":"listening"'), {
      timeout: 5000,
    });
    const started = JSON.parse(process.stdout().split("\n")[0] as string);
    const client = request(`http://127.0.0.1:${started.port}/api/v1/add`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "content-length": "100",
        expect: "100-continue",
      },
    });
    client.on("error", () => {});
    try {
      const continuing = once(client, "continue");
      client.flushHeaders();
      await continuing;
      client.write("{");
      process.child.kill("SIGTERM");
      expect(await process.closed).toEqual([1, null]);
      expect(process.stdout()).toContain('"graceful":false');
    } finally {
      client.destroy();
    }
  });

  it("fails clearly when the port is already bound", async () => {
    const server = createServer();
    server.listen(0, "127.0.0.1");
    await once(server, "listening");
    try {
      const address = server.address();
      if (address === null || typeof address === "string") throw new Error("TCP address missing");
      const process = launch("src/main.ts", [], { PORT: String(address.port) });
      expect(await process.closed).toEqual([1, null]);
      expect(process.stdout()).toContain("EADDRINUSE");
    } finally {
      await new Promise<void>((resolve, reject) => {
        server.close((error) => (error ? reject(error) : resolve()));
      });
    }
  });

  it("runs both the legacy wrapper and the calculator executable", async () => {
    const wrapper = launch("scripts/do_something.ts", ["--message", "world"]);
    expect(await wrapper.closed).toEqual([0, null]);
    expect(wrapper.stdout()).toBe("Hello, world!\n");
    const calculator = launch("src/bin/cli.ts", ["sum", "1", "2", "3"]);
    expect(await calculator.closed).toEqual([0, null]);
    expect(calculator.stdout()).toBe("6\n");
    const invalid = launch("src/bin/cli.ts", []);
    expect(await invalid.closed).toEqual([1, null]);
    expect(invalid.stderr()).toContain("--message");
  });
});
