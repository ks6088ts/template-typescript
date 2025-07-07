import { Command } from "commander";

const program = new Command();

program
  .name("do_something")
  .description("A simple script to display a message")
  .option("-m, --message <message>", "message to display")
  .action((options) => {
    if (!options.message) {
      console.error("Please provide a message using --message option.");
      process.exit(1);
    }
    console.log(`Hello, ${options.message}!`);
  });

// スクリプトを実行する
program.parse(process.argv);
