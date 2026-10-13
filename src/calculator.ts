export class CalculationError extends Error {
  readonly kind: "invalid-input" | "overflow";

  constructor(kind: "invalid-input" | "overflow", message: string) {
    super(message);
    this.name = "CalculationError";
    this.kind = kind;
  }
}

function add(a: number, b: number): number {
  if (!Number.isFinite(a) || !Number.isFinite(b)) {
    throw new CalculationError("invalid-input", "Operands must be finite numbers.");
  }
  const result = a + b;
  if (!Number.isFinite(result)) {
    throw new CalculationError("overflow", "The result exceeds the finite number range.");
  }
  return result;
}

function sum(numbers: readonly number[]): number {
  if (numbers.length === 0) {
    throw new CalculationError("invalid-input", "At least one number is required.");
  }
  return numbers.reduce(add, 0);
}

export const calculator = { add, sum };
