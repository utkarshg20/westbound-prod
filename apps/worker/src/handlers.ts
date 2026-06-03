import type { Job } from "bullmq";
import {
  createAllWorkers,
  createSupabaseAdmin,
  logger,
  recordDeadLetterJob,
  type JobType,
  type WestboundJobPayload,
} from "@westbound/platform";
import {
  AssetLibrary,
  enqueueChannelVideo,
  runStudioPoc,
  runVerticalSlice,
  StudioPipeline,
  YouTubeFactory,
} from "@westbound/studio";
import {
  BriefMatcher,
  SyncEngine,
  routeTrackToEngines,
  runSupervisorOutreachDrafts,
} from "@westbound/sync-engine";
import { captureJobException } from "./sentry.js";

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
    await recordDeadLetterJob(job, message);
  } catch {
    logger.error("Failed to persist job error", { message });
  }
}

export function startWorkers(): ReturnType<typeof createAllWorkers> {
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
      for (const id of ids) {
        await routeTrackToEngines(id);
      }
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
    "sync.supervisor_outreach": async () => {
      const n = await runSupervisorOutreachDrafts();
      logger.info("Supervisor outreach drafted", { count: n });
    },
    "studio.generate_episode": async (job) => {
      const runId = String(job.data.payload.runId ?? job.data.productionRunId);
      const pipeline = await StudioPipeline.create();
      await pipeline.runEpisodeGeneration(runId);
    },
    "studio.trend_hijack": async (job) => {
      const topic = String(job.data.payload.topic ?? "breaking");
      const channelSlug = String(job.data.payload.channelSlug ?? "slow_money");
      await enqueueChannelVideo(channelSlug, topic);
      logger.info("Trend hijack video enqueued", { topic, channelSlug });
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
      const channel = String(job.data.payload.channelSlug ?? "lofi_compounder");
      if (job.data.payload.proof14 === true) {
        const ids = await factory.schedule14DayProof(channel);
        logger.info("14-day YT proof scheduled", { count: ids.length, channel });
      } else if (job.data.payload.topic) {
        await enqueueChannelVideo(channel, String(job.data.payload.topic));
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
    "youtube.enqueue_channel_video": async (job) => {
      await enqueueChannelVideo(
        String(job.data.payload.channelSlug),
        String(job.data.payload.topic ?? "default")
      );
    },
    "youtube.title_thumb_rotate": async (job) => {
      logger.info("Title/thumb rotation cron", {
        videoId: job.data.payload.videoId,
      });
    },
    "track.multi_route": async (job) => {
      await routeTrackToEngines(String(job.data.payload.trackId));
    },
    "dsp.release_candidate": async (job) => {
      const { createDspRelease } = await import("@westbound/dsp");
      const trackId = String(job.data.payload.trackId);
      await createDspRelease(
        String(job.data.productionRunId ?? crypto.randomUUID()),
        trackId,
        new Date()
      );
      logger.info("DSP release candidate", { trackId });
    },
    "dsp.compilation_batch": async (job) => {
      logger.info("DSP compilation batch queued", { trackId: job.data.payload.trackId });
    },
    "identifyy.register": async (job) => {
      logger.info("Identifyy registration queued", { trackId: job.data.payload.trackId });
    },
    "agent.continuity_check": async () => {
      logger.info("Continuity check runs inline in studio.generate_episode");
    },
    "agent.metadata_tag": async () => {
      logger.info("Metadata tag runs inline in sync.generate_batch");
    },
  };

  const workers = createAllWorkers(handlers);

  for (const worker of workers) {
    worker.on("failed", (job, err) => {
      if (job) void logError(job, err.message);
      logger.error("Job failed", {
        jobId: job?.id,
        jobType: job?.data.type,
        productionRunId: job?.data.productionRunId,
        error: err.message,
      });
      captureJobException(err, {
        jobType: job?.data.type,
        productionRunId: job?.data.productionRunId,
      });
    });
  }

  logger.info("Workers started", { count: workers.length });
  return workers;
}

export async function runPocJob() {
  return runStudioPoc();
}

export async function runVerticalSliceJob() {
  return runVerticalSlice();
}
