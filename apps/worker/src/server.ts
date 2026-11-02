import { timingSafeEqual } from "node:crypto";
import express from "express";
import { enqueueJob, JobTypeSchema, logger } from "@westbound/platform";
import { runPocJob, runVerticalSliceJob } from "./handlers.js";

export function createServer(): express.Application {
  const app = express();
  app.use(express.json());

  const secret = process.env.N8N_WEBHOOK_SECRET;
  // With N8N_WEBHOOK_SECRET set the secret is always enforced. Without it a worker used to run open (the .env.example
  // default), so anyone who could reach the port could enqueue any job, including ones that spend provider credits or
  // publish to YouTube. REQUIRE_N8N_SECRET=true refuses everything but /health in that case. Left unset, an already
  // running deployment keeps working while it logs, loudly, that it is open: tightening must not stop n8n on the
  // deploy that ships it. Set the secret (worker, dashboard, n8n) and the worker is closed.
  const requireSecret = process.env.REQUIRE_N8N_SECRET === "true";
  const allowOpen = !requireSecret;
  if (!secret && requireSecret) {
    logger.error("N8N_WEBHOOK_SECRET is not set and REQUIRE_N8N_SECRET is set: every worker request except /health will be refused");
  } else if (!secret) {
    logger.error("N8N_WEBHOOK_SECRET is not set: the worker is accepting UNAUTHENTICATED job requests. Set the secret (worker, dashboard, n8n) to close it.");
  }

  app.use((req, res, next) => {
    if (req.path === "/health") return next();
    if (!secret) {
      if (allowOpen) return next();
      res.status(503).json({ error: "Worker is not configured: set N8N_WEBHOOK_SECRET" }); // only with REQUIRE_N8N_SECRET=true
      return;
    }
    const provided = String(req.headers["x-n8n-secret"] ?? "");
    const a = Buffer.from(provided);
    const b = Buffer.from(secret);
    const match = a.length === b.length && timingSafeEqual(a, b);
    if (!match) {
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
      const body = (req.body ?? {}) as { type?: unknown; payload?: unknown; productionRunId?: unknown };
      const parsedType = JobTypeSchema.safeParse(body.type);
      if (!parsedType.success) {
        res.status(400).json({ error: "Unknown job type" });
        return;
      }
      if (body.payload !== undefined && (typeof body.payload !== "object" || body.payload === null || Array.isArray(body.payload))) {
        res.status(400).json({ error: "payload must be an object" });
        return;
      }
      const productionRunId = typeof body.productionRunId === "string" ? body.productionRunId : undefined;
      const id = await enqueueJob(parsedType.data, (body.payload as Record<string, unknown> | undefined) ?? {}, { productionRunId });
      res.json({ jobId: id });
    } catch (e) {
      logger.error("enqueue job failed", { error: String(e) });
      res.status(500).json({ error: String(e) });
    }
  });

  app.post("/api/studio/poc", async (_req, res) => {
    try {
      const results = await runPocJob();
      res.json({ results });
    } catch (e) {
      logger.error("studio poc job failed", { error: String(e) });
      res.status(500).json({ error: String(e) });
    }
  });

  app.post("/api/studio/vertical-slice", async (_req, res) => {
    try {
      const result = await runVerticalSliceJob();
      res.json(result);
    } catch (e) {
      logger.error("studio vertical-slice job failed", { error: String(e) });
      res.status(500).json({ error: String(e) });
    }
  });

  return app;
}
