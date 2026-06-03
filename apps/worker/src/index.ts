import { createServer } from "./server.js";
import { startWorkers } from "./handlers.js";
import { initSentry } from "./sentry.js";
import { logger } from "@westbound/platform";

const port = Number(process.env.WORKER_PORT ?? 3001);

initSentry();

const workers = startWorkers();
const app = createServer();

const server = app.listen(port, () => {
  logger.info(`Worker API listening on :${port}`, {
    gitSha: process.env.GIT_SHA,
  });
});

let shuttingDown = false;
async function shutdown(signal: string) {
  if (shuttingDown) return;
  shuttingDown = true;
  logger.info("Shutting down", { signal });
  await Promise.all(workers.map((w) => w.close()));
  server.close(() => process.exit(0));
}

process.on("SIGTERM", () => void shutdown("SIGTERM"));
process.on("SIGINT", () => void shutdown("SIGINT"));
