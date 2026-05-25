import type { Job } from "bullmq";
import {
  createJobWorker,
  createSupabaseAdmin,
  logger,
  type JobType,
  type WestboundJobPayload,
} from "@westbound/platform";
import {
  AssetLibrary,
  runStudioPoc,
  runVerticalSlice,
  StudioPipeline,
  YouTubeFactory,
} from "@westbound/studio";
import { BriefMatcher, SyncEngine } from "@westbound/sync-engine";

async function logError(
  job: Job<WestboundJobPayload>,
  message: string
): Promise<void> {
  try {
    const db = createSupabaseAdmin();
    await db.from("job_errors").insert({
      job_type: job.data.type,
      production_run_id: job.data.productionRunId ?? null,
      message,
      payload: job.data.payload,
    });
  } catch {
    logger.error("Failed to persist job error", { message });
  }
}

export function startWorkers(): void {
  const handlers: Partial<
    Record<JobType, (job: Job<WestboundJobPayload>) => Promise<void>>
  > = {
    "sync.signal_ingest": async (job) => {
      const engine = new SyncEngine();
      const n = await engine.runSignalIngest();
      logger.info("Signal ingest complete", { count: n, jobId: job.id });
    },
    "sync.generate_batch": async (job) => {
      const engine = new SyncEngine();
      const ids = await engine.runGenerateBatch(
        Number(job.data.payload.limit ?? 5)
      );
      await engine.submitToCurationQueue(ids);
      logger.info("Sync batch generated", { trackCount: ids.length });
    },
    "sync.upload_track": async (job) => {
      const engine = new SyncEngine();
      const ids = job.data.payload.trackIds as string[];
      await engine.uploadApprovedTracks(ids);
    },
    "sync.brief_match": async (_job) => {
      const matcher = new BriefMatcher();
      const n = await matcher.runMatchAndSubmit();
      logger.info("Brief match submitted", { count: n });
    },
    "studio.generate_episode": async (job) => {
      const runId = String(job.data.payload.runId ?? job.data.productionRunId);
      const pipeline = await StudioPipeline.create();
      await pipeline.runEpisodeGeneration(runId);
    },
    "studio.ingest_asset": async (job) => {
      const library = await AssetLibrary.create();
      const p = job.data.payload as {
        projectSlug: string;
        entitySlug: string;
        filename: string;
        bodyBase64: string;
        contentType: string;
        type: "image" | "video" | "audio";
      };
      await library.ingest({
        projectSlug: p.projectSlug,
        entitySlug: p.entitySlug,
        type: p.type,
        filename: p.filename,
        body: Buffer.from(p.bodyBase64, "base64"),
        contentType: p.contentType,
      });
    },
    "youtube.assemble_video": async (job) => {
      const factory = new YouTubeFactory();
      const channel = String(job.data.payload.channelSlug ?? "lofi");
      if (job.data.payload.proof14 === true) {
        const ids = await factory.schedule14DayProof(channel);
        logger.info("14-day YT proof scheduled", { count: ids.length, channel });
      } else {
        await factory.runSingleChannelProof(channel);
      }
    },
    "youtube.publish": async (job) => {
      const runId = String(job.data.payload.runId ?? job.data.productionRunId);
      if (!runId) throw new Error("runId required for youtube.publish");
      const pipeline = await StudioPipeline.create();
      await pipeline.publish(runId);
      logger.info("Episode published", { runId });
    },
    "agent.continuity_check": async (_job) => {
      logger.info("Continuity check runs inline in studio.generate_episode");
    },
    "agent.metadata_tag": async (_job) => {
      logger.info("Metadata tag runs inline in sync.generate_batch");
    },
  };

  const worker = createJobWorker(handlers);

  worker.on("failed", (job, err) => {
    if (job) void logError(job, err.message);
    logger.error("Job failed", { jobId: job?.id, error: err.message });
  });

  logger.info("Worker started");
}

export async function runPocJob() {
  return runStudioPoc();
}

export async function runVerticalSliceJob() {
  return runVerticalSlice();
}
