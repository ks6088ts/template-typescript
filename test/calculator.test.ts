import { describe, expect, it } from "vitest";
import { CalculationError, calculator } from "../src/calculator.ts";

describe("calculator", () => {
  it("add should correctly sum two numbers", () => {
    const result = calculator.add(2, 3);
    expect(result).toBe(5);
  });

  it.each([
    [0, 0, 0],
    [-2, 3, 1],
    [0.5, 0.25, 0.75],
    [Number.MAX_VALUE, -Number.MAX_VALUE, 0],
    [Number.MIN_VALUE, Number.MIN_VALUE, Number.MIN_VALUE * 2],
  ])("adds finite edge cases %s and %s", (a, b, expected) => {
    expect(calculator.add(a, b)).toBe(expected);
  });

  it.each([NaN, Infinity, -Infinity])("rejects nonfinite input %s", (input) => {
    expect(() => calculator.add(input, 1)).toThrow(CalculationError);
    expect(() => calculator.add(1, input)).toThrow("finite numbers");
  });

  it("rejects positive and negative overflow", () => {
    expect(() => calculator.add(Number.MAX_VALUE, Number.MAX_VALUE)).toThrow("finite number range");
    expect(() => calculator.add(-Number.MAX_VALUE, -Number.MAX_VALUE)).toThrow(CalculationError);
  });

  it("sums without mutating input", () => {
    const values = Object.freeze([1, -2, 3, 0.5]);
    expect(calculator.sum(values)).toBe(2.5);
    expect(values).toEqual([1, -2, 3, 0.5]);
  });

  it("rejects empty, nonfinite and overflowing sums", () => {
    expect(() => calculator.sum([])).toThrow("At least one");
    expect(() => calculator.sum([1, NaN])).toThrow(CalculationError);
    expect(() => calculator.sum([Number.MAX_VALUE, Number.MAX_VALUE])).toThrow(
      "finite number range",
    );
  });
});
