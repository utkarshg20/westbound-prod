import { createServer } from "./server.js";
import { startWorkers } from "./handlers.js";
import { logger } from "@westbound/platform";

const port = Number(process.env.WORKER_PORT ?? 3001);

startWorkers();
const app = createServer();
app.listen(port, () => {
  logger.info(`Worker API listening on :${port}`);
});
