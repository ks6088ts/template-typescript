import { describe, expect, it, vi } from "vitest";
import { createLogger } from "../src/logger.ts";

describe("JSON logger", () => {
  it("writes one structured line and escapes untrusted input", () => {
    const write = vi.fn();
    createLogger({ write })("request", { requestId: "a\nb", event: "spoof", timestamp: "spoof" });
    expect(write).toHaveBeenCalledOnce();
    const output = write.mock.calls[0]?.[0] as string;
    expect(output.split("\n")).toHaveLength(2);
    expect(JSON.parse(output)).toEqual({
      requestId: "a\nb",
      event: "request",
      timestamp: expect.any(String),
    });
  });

  it("defaults to process stdout and empty fields", () => {
    const write = vi.spyOn(process.stdout, "write").mockReturnValue(true);
    try {
      createLogger()("started");
      expect(write).toHaveBeenCalledWith(expect.stringContaining('"event":"started"'));
    } finally {
      write.mockRestore();
    }
  });
});
