import { createAdapterRegistry, type AdapterRegistry } from "@westbound/adapters";
import {
  checkContinuity,
  createLlmClient,
  planShots,
  scoreFaceDrift,
} from "@westbound/agents";
import {
  createRepository,
  enqueueJob,
  type ProductionRun,
  type ProductionStage,
} from "@westbound/platform";
import { AssetLibrary } from "./asset-library.js";

const STAGES: ProductionStage[] = [
  "draft",
  "generating",
  "assets_ready",
  "dan_review",
  "scheduled",
  "published",
  "dsp_live",
];

export interface EpisodePipelineInput {
  title: string;
  script: string;
  songPrompt: string;
  lyrics?: string;
  storyBeatId?: string;
}

export class StudioPipeline {
  private readonly repo = createRepository();

  private constructor(
    private readonly library: AssetLibrary,
    private readonly adapters: AdapterRegistry
  ) {}

  static async create(): Promise<StudioPipeline> {
    const library = await AssetLibrary.create();
    return new StudioPipeline(library, createAdapterRegistry());
  }

  /** Load Episode 1 (or N) from story_beats table */
  static async loadStoryBeatInput(
    episodeNumber = 1
  ): Promise<EpisodePipelineInput | null> {
    const repo = createRepository();
    const projects = await repo.listProjects();
    const studio = projects.find((p) => p.slug === "studio");
    if (!studio) return null;
    const beats = await repo.listStoryBeats(studio.id);
    const beat = beats.find((b) => b.episode_number === episodeNumber);
    if (!beat) return null;
    const meta = beat.metadata as Record<string, string>;
    return {
      title: beat.title,
      script: beat.script_excerpt ?? beat.summary,
      songPrompt:
        meta.songPrompt ??
        "Modern post-grunge, raw vocal, Pearl Jam meets Manchester Orchestra, 2:45",
      lyrics: meta.lyrics,
      storyBeatId: beat.id,
    };
  }

  async createEpisodeRun(input: EpisodePipelineInput): Promise<ProductionRun> {
    const projects = await this.repo.listProjects();
    const studio = projects.find((p) => p.slug === "studio");
    if (!studio) throw new Error("Studio project not seeded");

    const { createSupabaseAdmin } = await import("@westbound/platform");
    const db = createSupabaseAdmin();
    const { data, error } = await db
      .from("production_runs")
      .insert({
        project_id: studio.id,
        kind: "episode",
        title: input.title,
        stage: "draft",
        status: "active",
        metadata: {
          tier: "hero",
          script: input.script,
          songPrompt: input.songPrompt,
          storyBeatId: input.storyBeatId,
        },
      })
      .select()
      .single();
    if (error) throw error;
    return data as ProductionRun;
  }

  async runEpisodeGeneration(runId: string): Promise<ProductionRun> {
    const run = await this.repo.getProductionRun(runId);
    if (!run) throw new Error(`Run not found: ${runId}`);

    await this.repo.updateProductionStage(runId, "generating");

    const llm = await createLlmClient();
    const script = String(run.metadata.script ?? "");
    const beats = await this.repo.listStoryBeats(run.project_id);

    const continuity = await checkContinuity(llm, script, beats, [
      "Sammy is sober",
      "Band is Sammy Rane and Westbound — four members",
    ]);

    if (!continuity.passed) {
      await this.repo.updateProductionStage(runId, "dan_review", "active");
      const { createSupabaseAdmin } = await import("@westbound/platform");
      await createSupabaseAdmin().from("production_runs").update({
        metadata: { ...run.metadata, continuity },
      }).eq("id", runId);
      return (await this.repo.getProductionRun(runId))!;
    }

    const shotPlan = await planShots(llm, script);
    const characters = await this.repo.listCharacters(run.project_id);
    const sammy = characters.find((c) => c.slug === "sammy_rane");

    const songVariations = await this.adapters.music.generate({
      prompt: String(run.metadata.songPrompt ?? ""),
      personaId: "sammy_persona_v1",
      variations: 4,
    });

    let totalCost = 0;
    for (const v of songVariations) {
      totalCost += v.costCents ?? 0;
      if (sammy) {
        await this.library.ingest({
          projectSlug: "studio",
          entitySlug: "sammy_rane",
          characterId: sammy.id,
          type: "audio",
          filename: `${v.id}.wav`,
          body: Buffer.from(""),
          contentType: "audio/wav",
          tool: "suno",
          tags: ["song", "draft"],
          metadata: { variationId: v.id, uri: v.uri },
        });
      }
    }

    for (const shot of shotPlan.shots) {
      const provider = this.adapters.videoRouter.pickProvider({
        script,
        shotType: shot.shotType,
        hasCharacter: shot.hasCharacter,
      });
      const video = await provider.generate({
        prompt: shot.prompt,
        shotType: shot.shotType,
        characterId: sammy?.id,
        durationSec: 8,
      });
      totalCost += video.costCents ?? 0;

      if (shot.hasCharacter) {
        const qa = scoreFaceDrift([], []);
        if (sammy) {
          await this.library.ingest({
            projectSlug: "studio",
            entitySlug: "sammy_rane",
            characterId: sammy.id,
            type: "video",
            filename: `shot_${shot.index}.mp4`,
            body: Buffer.from(""),
            contentType: "video/mp4",
            tool: provider.name,
            tags: ["episode", shot.shotType, qa.flagged ? "qa_flagged" : "qa_ok"],
            metadata: { shot, driftScore: qa.driftScore, uri: video.uri },
          });
        }
      }
    }

    await this.repo.addJobCost(runId, totalCost);
    return this.repo.updateProductionStage(runId, "assets_ready");
  }

  async submitForReview(runId: string): Promise<ProductionRun> {
    return this.repo.updateProductionStage(runId, "dan_review");
  }

  async approveAndSchedule(
    runId: string,
    scheduledAt: Date
  ): Promise<ProductionRun> {
    await this.repo.updateProductionStage(runId, "scheduled");
    const { createSupabaseAdmin } = await import("@westbound/platform");
    const db = createSupabaseAdmin();
    await db.from("releases").insert({
      production_run_id: runId,
      scheduled_at: scheduledAt.toISOString(),
      platforms: ["youtube", "spotify"],
      stage: "scheduled",
    });
    await enqueueJob("youtube.publish", { runId }, { productionRunId: runId });
    return this.repo.updateProductionStage(runId, "scheduled");
  }

  async publish(runId: string): Promise<ProductionRun> {
    const run = await this.repo.getProductionRun(runId);
    if (!run) throw new Error(`Run not found: ${runId}`);

    const title = run.title;
    const resolveMasterUri = String(run.metadata.resolveMasterUri ?? "");
    const publishers = this.adapters.publishers;

    if (this.adapters.creatomate && process.env.CREATOMATE_TEMPLATE_SHORTS) {
      const mod = {
        master_uri: resolveMasterUri,
        formats: ["9:16", "9:16", "16:9"],
      };
      await this.adapters.creatomate.render({
        templateId: process.env.CREATOMATE_TEMPLATE_SHORTS,
        modifications: mod,
      });
    }

    await publishers.youtube.publish({
      title,
      description: String(run.metadata.description ?? "Sammy Rane and Westbound"),
      mediaUri: resolveMasterUri || String(run.metadata.episodeVideoUri ?? ""),
      scheduledAt: run.metadata.scheduledAt
        ? new Date(String(run.metadata.scheduledAt))
        : undefined,
      tags: ["Sammy Rane", "Westbound", "rockumentary"],
    });

    const { createDspRelease, getReleaseChecklist } = await import("@westbound/dsp");
    const trackId = run.metadata.trackId as string | undefined;
    if (trackId) {
      await createDspRelease(
        runId,
        trackId,
        new Date(String(run.metadata.scheduledAt ?? Date.now()))
      );
    }
    const metadata = {
      ...run.metadata,
      dspChecklist: getReleaseChecklist(),
      publishedAt: new Date().toISOString(),
    };

    const { createSupabaseAdmin } = await import("@westbound/platform");
    await createSupabaseAdmin()
      .from("production_runs")
      .update({ metadata })
      .eq("id", runId);

    await this.repo.updateProductionStage(runId, "published");
    return this.repo.updateProductionStage(runId, "dsp_live");
  }

  getStageOrder(): ProductionStage[] {
    return [...STAGES];
  }
}
