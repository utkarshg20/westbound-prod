import express from "express";
import { enqueueJob, type JobType } from "@westbound/platform";
import { runPocJob, runVerticalSliceJob } from "./handlers.js";

export function createServer(): express.Application {
  const app = express();
  app.use(express.json());

  const secret = process.env.N8N_WEBHOOK_SECRET;

  app.use((req, res, next) => {
    if (req.path === "/health") return next();
    if (secret && req.headers["x-n8n-secret"] !== secret) {
      res.status(401).json({ error: "Unauthorized" });
      return;
    }
    next();
  });

  app.get("/health", (_req, res) => {
    res.json({ ok: true });
  });

  app.post("/api/jobs/enqueue", async (req, res) => {
    try {
      const { type, payload, productionRunId } = req.body as {
        type: JobType;
        payload?: Record<string, unknown>;
        productionRunId?: string;
      };
      const id = await enqueueJob(type, payload ?? {}, { productionRunId });
      res.json({ jobId: id });
    } catch (e) {
      res.status(500).json({ error: String(e) });
    }
  });

  app.post("/api/studio/poc", async (_req, res) => {
    try {
      const results = await runPocJob();
      res.json({ results });
    } catch (e) {
      res.status(500).json({ error: String(e) });
    }
  });

  app.post("/api/studio/vertical-slice", async (_req, res) => {
    try {
      const result = await runVerticalSliceJob();
      res.json(result);
    } catch (e) {
      res.status(500).json({ error: String(e) });
    }
  });

  return app;
}
