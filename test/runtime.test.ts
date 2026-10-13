import { afterEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  loadConfig: vi.fn(),
  log: vi.fn(),
  start: vi.fn(),
  stop: vi.fn(),
}));

vi.mock("../src/config.ts", () => ({ loadConfig: mocks.loadConfig }));
vi.mock("../src/logger.ts", () => ({ createLogger: () => mocks.log }));
vi.mock("../src/service.ts", () => ({
  createService: () => ({ start: mocks.start, stop: mocks.stop }),
}));

import { runServer } from "../src/runtime.ts";

describe("runtime lifecycle", () => {
  const originalExitCode = process.exitCode;
  const termListeners = process.listeners("SIGTERM");
  const intListeners = process.listeners("SIGINT");

  afterEach(() => {
    for (const listener of process.listeners("SIGTERM")) {
      if (!termListeners.includes(listener)) process.removeListener("SIGTERM", listener);
    }
    for (const listener of process.listeners("SIGINT")) {
      if (!intListeners.includes(listener)) process.removeListener("SIGINT", listener);
    }
    process.exitCode = originalExitCode;
    vi.resetAllMocks();
  });

  it.each(["SIGTERM", "SIGINT"] as const)("drains on %s", async (signal) => {
    mocks.start.mockResolvedValue({ address: "127.0.0.1", port: 1234 });
    mocks.stop.mockResolvedValue(true);
    await runServer();
    const listeners = process.listeners(signal);
    const onSignal = listeners.at(-1);
    if (!onSignal) throw new Error("Signal listener missing");
    onSignal(signal);
    await vi.waitFor(() =>
      expect(mocks.log).toHaveBeenCalledWith("shutdown_complete", { graceful: true }),
    );
    expect(mocks.log).toHaveBeenCalledWith("listening", { host: "127.0.0.1", port: 1234 });
    expect(mocks.log).toHaveBeenCalledWith("shutdown_started", { signal });
    expect(mocks.stop).toHaveBeenCalledOnce();
  });

  it("reports forced shutdown with nonzero exit status", async () => {
    mocks.start.mockResolvedValue({ address: "127.0.0.1", port: 1234 });
    mocks.stop.mockResolvedValue(false);
    await runServer();
    process.listeners("SIGTERM").at(-1)?.("SIGTERM");
    await vi.waitFor(() => expect(process.exitCode).toBe(1));
    expect(mocks.log).toHaveBeenCalledWith("shutdown_complete", { graceful: false });
  });

  it.each([
    [new Error("PORT invalid"), "INVALID_CONFIG", "PORT invalid"],
    [Object.assign(new Error("Port busy"), { code: "EADDRINUSE" }), "EADDRINUSE", "Port busy"],
    ["unknown", "INVALID_CONFIG", "Startup failed."],
  ])("reports startup failure", async (error, code, message) => {
    mocks.start.mockRejectedValue(error);
    await runServer();
    expect(process.exitCode).toBe(1);
    expect(mocks.log).toHaveBeenCalledWith("startup_failed", { code, message });
  });

  it("does not bind when configuration is invalid", async () => {
    mocks.loadConfig.mockImplementation(() => {
      throw new Error("Invalid host");
    });
    await runServer();
    expect(mocks.start).not.toHaveBeenCalled();
    expect(process.exitCode).toBe(1);
  });
});
