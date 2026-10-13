import { runCli } from "../src/cli.ts";

process.exitCode = runCli(process.argv.slice(2), {
  stdout: (message) => process.stdout.write(message),
  stderr: (message) => process.stderr.write(message),
});
