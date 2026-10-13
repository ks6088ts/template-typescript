import { describe, expect, it } from "vitest";
import { initializeContent } from "../scripts/init-template.ts";

describe("template initialization", () => {
  it("updates only template-owned repository references", () => {
    const original =
      'https://github.com/ks6088ts/template-typescript * @ks6088ts {"name": "template-typescript", "author": "ks6088ts"}';
    expect(initializeContent(original, "example-team", "My-Service")).toBe(
      'https://github.com/example-team/My-Service * @example-team {"name": "my-service", "author": "example-team"}',
    );
  });

  it("preserves unrelated content", () => {
    expect(initializeContent("node:24 example", "team", "app")).toBe("node:24 example");
  });

  it.each([
    ["bad\nowner", "app"],
    ["-owner", "app"],
    ["owner", "../app"],
    ["owner", 'app"'],
    ["owner", ".."],
  ])("rejects unsafe names", (owner, repo) => {
    expect(() => initializeContent("", owner, repo)).toThrow("Invalid");
  });
});
