import { loadConfig } from "./config.ts";
import { createLogger } from "./logger.ts";
import { createService } from "./service.ts";

export async function runServer(): Promise<void> {
  const log = createLogger();
  try {
    const config = loadConfig();
    const service = createService(config, log);
    const address = await service.start();
    log("listening", { host: address.address, port: address.port });
    const shutdown = (signal: NodeJS.Signals) => {
      log("shutdown_started", { signal });
      void service.stop().then((graceful) => {
        process.removeListener("SIGTERM", onTerm);
        process.removeListener("SIGINT", onInt);
        if (!graceful) process.exitCode = 1;
        log("shutdown_complete", { graceful });
      });
    };
    const onTerm = () => shutdown("SIGTERM");
    const onInt = () => shutdown("SIGINT");
    process.once("SIGTERM", onTerm);
    process.once("SIGINT", onInt);
  } catch (error) {
    const code =
      error instanceof Error && "code" in error && typeof error.code === "string"
        ? error.code
        : "INVALID_CONFIG";
    log("startup_failed", {
      code,
      message: error instanceof Error ? error.message : "Startup failed.",
    });
    process.exitCode = 1;
  }
}
