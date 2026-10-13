import { describe, expect, it } from "vitest";
import { runCli } from "../src/cli.ts";

function invoke(args: string[]) {
  let stdout = "";
  let stderr = "";
  const code = runCli(args, {
    stdout: (message) => {
      stdout += message;
    },
    stderr: (message) => {
      stderr += message;
    },
  });
  return { code, stdout, stderr };
}

describe("CLI", () => {
  it.each([
    ["--message", "world"],
    ["-m", "world"],
  ])("retains message behavior %j", (...args) => {
    expect(invoke(args)).toEqual({ code: 0, stdout: "Hello, world!\n", stderr: "" });
  });

  it("prints help", () => {
    expect(invoke(["--help"])).toMatchObject({ code: 0, stderr: "" });
    expect(invoke(["-h"]).stdout).toContain("Usage:");
  });

  it.each([
    [["add", "2", "3"], "5\n"],
    [["add", "--", "-1", "2"], "1\n"],
    [["sum", "1", "2.5", "1e2"], "103.5\n"],
  ])("calculates %j", (args, stdout) => {
    expect(invoke(args)).toEqual({ code: 0, stdout, stderr: "" });
  });

  it.each([
    [],
    ["--unknown"],
    ["--message"],
    ["--message", ""],
    ["--message", "hello", "add"],
    ["add", "1"],
    ["add", "1", "2", "3"],
    ["sum"],
    ["multiply", "1", "2"],
    ["add", " ", "1"],
    ["add", "0x10", "1"],
    ["add", "1abc", "1"],
    ["add", "NaN", "1"],
    ["add", "Infinity", "1"],
    ["add", "1e999", "1"],
    ["add", "1e308", "1e308"],
    ["sum", ...Array.from({ length: 1001 }, () => "1")],
  ])("reports invalid arguments %j", (...args) => {
    const result = invoke(args);
    expect(result.code).toBe(1);
    expect(result.stdout).toBe("");
    expect(result.stderr).not.toBe("");
  });

  it("handles unexpected failures without assuming Error objects", () => {
    let stderr = "";
    expect(
      runCli(["--help"], {
        stdout: () => {
          throw "output unavailable";
        },
        stderr: (message) => {
          stderr += message;
        },
      }),
    ).toBe(1);
    expect(stderr).toBe("Invalid arguments.\n");
  });
});
