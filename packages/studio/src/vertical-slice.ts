import { StudioPipeline } from "./pipeline.js";

export interface VerticalSliceOptions {
  /** Stop at dan_review — no auto publish (default true for production) */
  requireDanApproval?: boolean;
  episodeNumber?: number;
  /** Enqueue Creatomate shorts job after assets_ready */
  enqueueShorts?: boolean;
}

/**
 * End-to-end vertical slice: 1 song + 1 episode pipeline.
 * Default: stops at dan_review; Dan approves via dashboard → publish job.
 */
export async function runVerticalSlice(
  options: VerticalSliceOptions = {}
): Promise<{
  runId: string;
  stages: string[];
}> {
  const requireDanApproval = options.requireDanApproval !== false;
  const pipeline = await StudioPipeline.create();
  const stages: string[] = [];

  const input =
    (await StudioPipeline.loadStoryBeatInput(options.episodeNumber ?? 1)) ?? {
      title: "Vertical Slice — Episode 1",
      script: `INT. BAR — NIGHT\nSammy sits alone. Rain on the window.\nSAMMY\nI left Indiana. I didn't leave the noise.`,
      songPrompt:
        "Modern post-grunge, Pearl Jam meets Manchester Orchestra, raw vocal, big chorus, 2:45",
      lyrics: "Verse / chorus placeholder for Suno",
    };

  const run = await pipeline.createEpisodeRun(input);
  stages.push("draft");

  await pipeline.runEpisodeGeneration(run.id);
  stages.push("generating", "assets_ready");

  if (options.enqueueShorts !== false && process.env.CREATOMATE_TEMPLATE_SHORTS) {
    const { enqueueJob } = await import("@westbound/platform");
    await enqueueJob(
      "studio.render_shorts",
      { runId: run.id, templateId: process.env.CREATOMATE_TEMPLATE_SHORTS },
      { productionRunId: run.id }
    );
    stages.push("shorts_enqueued");
  }

  await pipeline.submitForReview(run.id);
  stages.push("dan_review");

  if (!requireDanApproval) {
    const scheduled = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
    await pipeline.approveAndSchedule(run.id, scheduled);
    stages.push("scheduled");
    await pipeline.publish(run.id);
    stages.push("published", "dsp_live");
  }

  return { runId: run.id, stages };
}
