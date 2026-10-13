import { parseArgs } from "node:util";
import { calculator } from "./calculator.ts";

export interface CliIO {
  stdout: (message: string) => void;
  stderr: (message: string) => void;
}

const usage =
  "Usage: do_something --message <message>\n" +
  "       calculator add <a> <b> | sum <numbers...>\n" +
  "Use -- before negative operands (for example: calculator add -- -1 2).\n";

function numeric(value: string): number {
  if (!/^-?(?:0|[1-9]\d*)(?:\.\d+)?(?:[eE][+-]?\d+)?$/.test(value)) {
    throw new Error("Operands must be finite decimal numbers.");
  }
  const number = Number(value);
  if (!Number.isFinite(number)) throw new Error("Operands must be finite decimal numbers.");
  return number;
}

export function runCli(args: string[], io: CliIO): number {
  try {
    const { values, positionals } = parseArgs({
      args,
      allowPositionals: true,
      strict: true,
      options: {
        message: { type: "string", short: "m" },
        help: { type: "boolean", short: "h" },
      },
    });
    if (values.help) {
      io.stdout(usage);
      return 0;
    }
    if (values.message !== undefined) {
      if (!values.message || positionals.length !== 0) {
        throw new Error("Provide a nonempty --message without a command.");
      }
      io.stdout(`Hello, ${values.message}!\n`);
      return 0;
    }
    const [command, ...operands] = positionals;
    let result: number;
    if (command === "add" && operands.length === 2) {
      result = calculator.add(numeric(operands[0] as string), numeric(operands[1] as string));
    } else if (command === "sum" && operands.length > 0 && operands.length <= 1000) {
      result = calculator.sum(operands.map(numeric));
    } else {
      throw new Error(
        "Please provide a message using --message option, or a valid add/sum command.",
      );
    }
    io.stdout(`${result}\n`);
    return 0;
  } catch (error) {
    io.stderr(`${error instanceof Error ? error.message : "Invalid arguments."}\n`);
    return 1;
  }
}
