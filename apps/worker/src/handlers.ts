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
    "studio.render_shorts": async (job) => {
      const runId = String(job.data.payload.runId ?? job.data.productionRunId);
      const templateId = String(
        job.data.payload.templateId ?? process.env.CREATOMATE_TEMPLATE_SHORTS ?? ""
      );
      if (!templateId) {
        logger.warn("studio.render_shorts: CREATOMATE_TEMPLATE_SHORTS not set");
        return;
      }
      const pipeline = await StudioPipeline.create();
      await pipeline.renderShorts(runId, templateId);
      logger.info("Creatomate shorts render complete", { runId, templateId });
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
      const videoId = String(job.data.payload.videoId ?? "");
      if (!videoId) {
        logger.warn("title_thumb_rotate: videoId required");
        return;
      }
      const db = createSupabaseAdmin();
      const { data: variants } = await db
        .from("title_variants")
        .select("*")
        .eq("video_id", videoId)
        .is("retired_at", null);

      if (!variants || variants.length < 2) {
        logger.info("Title/thumb rotation: need 2+ variants", { videoId });
        return;
      }

      const { createYouTubeAnalyticsClient } = await import("@westbound/adapters");
      const analytics = createYouTubeAnalyticsClient();
      const { data: ytVideo } = await db
        .from("youtube_videos")
        .select("youtube_video_id")
        .eq("id", videoId)
        .single();
      const ytId = String(ytVideo?.youtube_video_id ?? videoId);
      const samples = await analytics.sampleTitleCtr(
        ytId,
        variants.map((v) => String(v.text))
      );

      for (const sample of samples) {
        const match = variants.find((v) => v.text === sample.title);
        if (match) {
          await db
            .from("title_variants")
            .update({ ctr_observed: sample.ctr })
            .eq("id", match.id);
        }
      }

      const { data: ranked } = await db
        .from("title_variants")
        .select("*")
        .eq("video_id", videoId)
        .is("retired_at", null)
        .order("ctr_observed", { ascending: false })
        .limit(2);

      if (!ranked || ranked.length < 2) return;

      const winner = ranked[0]!;
      const loser = ranked[1]!;
      await db
        .from("title_variants")
        .update({ retired_at: new Date().toISOString() })
        .eq("id", loser.id);
      await db
        .from("title_variants")
        .update({ deployed_at: new Date().toISOString() })
        .eq("id", winner.id);
      await db
        .from("youtube_videos")
        .update({
          title: winner.text,
          metadata: { winningVariantId: winner.id, ctr: winner.ctr_observed },
        })
        .eq("id", videoId);

      logger.info("Title rotation applied", {
        videoId,
        winner: winner.text,
        ctr: winner.ctr_observed,
      });
    },
    "track.multi_route": async (job) => {
      await routeTrackToEngines(String(job.data.payload.trackId));
    },
    "dsp.release_candidate": async (job) => {
      const { publishReleaseCandidate } = await import("@westbound/dsp");
      const trackId = String(job.data.payload.trackId);
      const runId = String(job.data.productionRunId ?? crypto.randomUUID());
      await publishReleaseCandidate(runId, trackId);
      logger.info("DSP release candidate", { trackId, runId });
    },
    "dsp.compilation_batch": async () => {
      const { runCompilationBatch } = await import("@westbound/dsp");
      const ids = await runCompilationBatch(
        Number(process.env.COMPILATION_BATCH_LIMIT ?? 10)
      );
      logger.info("DSP compilation batch complete", { count: ids.length });
    },
    "identifyy.register": async (job) => {
      const { registerIdentifyyContentId } = await import("@westbound/dsp");
      const trackId = String(job.data.payload.trackId);
      const result = await registerIdentifyyContentId(trackId);
      logger.info("Identifyy registration complete", {
        trackId: result.trackId,
        registered: result.registered,
        externalId: result.externalId,
      });
    },
    "agent.continuity_check": async (job) => {
      const { createLlmClient, checkContinuity } = await import("@westbound/agents");
      const { createRepository } = await import("@westbound/platform");
      const runId = String(job.data.payload.runId ?? job.data.productionRunId ?? "");
      const script = String(job.data.payload.script ?? "");
      if (!runId || !script) {
        logger.warn("agent.continuity_check: runId + script required");
        return;
      }
      const repo = createRepository();
      const run = await repo.getProductionRun(runId);
      if (!run) throw new Error(`Run not found: ${runId}`);
      const beats = await repo.listStoryBeats(run.project_id);
      const llm = await createLlmClient();
      const result = await checkContinuity(
        llm,
        script,
        beats,
        (job.data.payload.canonConstraints as string[]) ?? [
          "Sammy is sober",
          "Band is Sammy Rane and Westbound — four members",
        ],
        { productionRunId: runId }
      );
      await createSupabaseAdmin()
        .from("production_runs")
        .update({
          metadata: { ...run.metadata, continuity: result },
          stage: result.passed ? run.stage : "dan_review",
        })
        .eq("id", runId);
      logger.info("Continuity check complete", {
        runId,
        passed: result.passed,
        flags: result.flags,
      });
    },
    "agent.metadata_tag": async (job) => {
      const { createLlmClient, tagTrackMetadata } = await import("@westbound/agents");
      const trackId = String(job.data.payload.trackId ?? "");
      const title = String(job.data.payload.title ?? "Untitled");
      const sunoPrompt = String(job.data.payload.sunoPrompt ?? "");
      if (!trackId) {
        logger.warn("agent.metadata_tag: trackId required");
        return;
      }
      const llm = await createLlmClient();
      const meta = await tagTrackMetadata(llm, title, sunoPrompt, {
        productionRunId: job.data.productionRunId,
      });
      if (!meta) {
        logger.warn("agent.metadata_tag: schema failure", { trackId });
        return;
      }
      const db = createSupabaseAdmin();
      const { data: track } = await db
        .from("tracks")
        .select("metadata")
        .eq("id", trackId)
        .single();
      await db
        .from("tracks")
        .update({
          mood_tags: meta.mood,
          metadata: { ...(track?.metadata as object), ...meta },
        })
        .eq("id", trackId);
      logger.info("Metadata tag complete", { trackId, genre: meta.genre });
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
