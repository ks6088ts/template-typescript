import { describe, it, expect } from "vitest";
import { calculator } from "../src/calculator";

describe("calculator", () => {
  it("add should correctly sum two numbers", () => {
    const result = calculator.add(2, 3);
    expect(result).toBe(5);
  });
});
