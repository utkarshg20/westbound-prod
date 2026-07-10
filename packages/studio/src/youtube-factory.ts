import { createAdapterRegistry } from "@westbound/adapters";
import {
  createRepository,
  createSupabaseAdmin,
  enqueueJob,
  fetchAndUploadToR2,
  logger,
} from "@westbound/platform";

/** Canonical channel slugs — must match `channels` seed rows */
export const CHANNEL_THEMES = [
  {
    slug: "lofi_compounder",
    aliases: ["lofi"],
    tags: ["lofi", "chill", "study"],
    loopPrompt: "lofi study desk, rain window, warm lamp, slow pan loop",
  },
  {
    slug: "ambient_sleep",
    aliases: ["ambient"],
    tags: ["ambient", "calm", "atmospheric"],
    loopPrompt: "deep ambient night sky, soft clouds, slow drift",
  },
  {
    slug: "rain_rock",
    aliases: [],
    tags: ["rock", "rain", "moody"],
    loopPrompt: "rain on neon city street, moody rock atmosphere",
  },
  {
    slug: "campfire_country",
    aliases: [],
    tags: ["country", "acoustic", "warm"],
    loopPrompt: "campfire at dusk, warm acoustic country vibe",
  },
  {
    slug: "neon_city",
    aliases: [],
    tags: ["synth", "night", "urban"],
    loopPrompt: "neon city night drive, synthwave colors",
  },
] as const;

export type ChannelThemeSlug = (typeof CHANNEL_THEMES)[number]["slug"];

export function resolveChannelSlug(input: string): string {
  const lower = input.toLowerCase().trim();
  const exact = CHANNEL_THEMES.find((t) => t.slug === lower);
  if (exact) return exact.slug;
  const byAlias = CHANNEL_THEMES.find((t) =>
    (t.aliases as readonly string[]).includes(lower)
  );
  return byAlias?.slug ?? lower;
}

export interface FacelessVideoSpec {
  channelSlug: string;
  trackUris: string[];
  visualLoopUri: string;
  introVoiceoverText: string;
  durationMinutes: number;
}

export function buildCreatomatePayload(spec: FacelessVideoSpec): Record<string, unknown> {
  return {
    template: "westbound_faceless_v1",
    modifications: {
      tracks: spec.trackUris,
      visual_loop: spec.visualLoopUri,
      intro: {
        text: spec.introVoiceoverText,
        duration_sec: 10,
      },
    },
    duration_minutes: spec.durationMinutes,
  };
}

export function introScript(channelSlug: string, durationMinutes: number): string {
  const names: Record<string, string> = {
    lofi_compounder: "Lofi Compounder",
    ambient_sleep: "Ambient Sleep",
    rain_rock: "Rain Rock",
    campfire_country: "Campfire Country",
    neon_city: "Neon City Nights",
    lofi: "Lofi Focus",
    ambient: "Deep Ambient",
  };
  const name = names[channelSlug] ?? channelSlug;
  return `Welcome to ${name} — ${durationMinutes} minutes of music to carry you through.`;
}

/** Generate (or stub) a visual loop still/video and upload to R2 */
export async function ensureVisualLoop(channelSlug: string): Promise<string> {
  const slug = resolveChannelSlug(channelSlug);
  const theme = CHANNEL_THEMES.find((t) => t.slug === slug);
  const prompt =
    theme?.loopPrompt ?? `${slug} atmospheric visual loop, cinematic, slow motion`;
  const defaultUri = `r2://westbound-assets/youtube/loops/${slug}_loop.mp4`;

  try {
    const adapters = createAdapterRegistry();
    const still = await adapters.image.generate({
      prompt,
      width: 1920,
      height: 1080,
    });
    const r2Uri = await fetchAndUploadToR2(still.uri, {
      projectSlug: "youtube_faceless",
      entitySlug: `loops/${slug}`,
      filename: `${slug}_loop.png`,
      contentType: "image/png",
    });
    logger.info("Visual loop generated", { channelSlug: slug, r2Uri });
    return r2Uri;
  } catch (e) {
    logger.warn("Visual loop generation failed, using default URI", {
      channelSlug: slug,
      error: String(e),
    });
    return defaultUri;
  }
}

export class YouTubeFactory {
  async assembleDailyVideo(channelSlug: string): Promise<FacelessVideoSpec> {
    const slug = resolveChannelSlug(channelSlug);
    const repo = createRepository();
    const tracks = await repo.listTracks({ source: "sync" });
    const theme = CHANNEL_THEMES.find((t) => t.slug === slug);
    const tagged = tracks.filter((t) =>
      theme?.tags.some((tag) => t.mood_tags.includes(tag))
    );
    const selected = tagged.slice(0, 25).map((t) => String(t.metadata.audioUri ?? ""));
    const visualLoopUri = await ensureVisualLoop(slug);

    return {
      channelSlug: slug,
      trackUris: selected.length ? selected : ["stub://placeholder_track"],
      visualLoopUri,
      introVoiceoverText: introScript(slug, 60),
      durationMinutes: 60,
    };
  }

  async schedulePublish(
    channelSlug: string,
    spec: FacelessVideoSpec
  ): Promise<string> {
    const slug = resolveChannelSlug(channelSlug);
    const db = createSupabaseAdmin();
    const projects = await createRepository().listProjects();
    const yt = projects.find((p) => p.slug === "youtube_faceless");

    const { data: run } = await db
      .from("production_runs")
      .insert({
        project_id: yt?.id,
        kind: "youtube_video",
        title: `${slug} — ${new Date().toISOString().slice(0, 10)}`,
        stage: "scheduled",
        metadata: {
          tier: "volume",
          creatomate: buildCreatomatePayload(spec),
          channelSlug: slug,
        },
      })
      .select()
      .single();

    return run?.id ?? "";
  }

  async runSingleChannelProof(channelSlug = "lofi_compounder"): Promise<string> {
    const slug = resolveChannelSlug(channelSlug);
    const spec = await this.assembleDailyVideo(slug);
    return this.schedulePublish(slug, spec);
  }

  /**
   * Schedule 14 daily faceless videos (1 channel proof).
   * Uses Creatomate publisher when configured; enqueues worker jobs otherwise.
   */
  async schedule14DayProof(
    channelSlug = "lofi_compounder"
  ): Promise<string[]> {
    const slug = resolveChannelSlug(channelSlug);
    const runIds: string[] = [];
    const adapters = createAdapterRegistry();
    const templateId = process.env.CREATOMATE_TEMPLATE_FACELESS;

    for (let day = 0; day < 14; day++) {
      const spec = await this.assembleDailyVideo(slug);
      const scheduledAt = new Date();
      scheduledAt.setDate(scheduledAt.getDate() + day);
      scheduledAt.setHours(8, 0, 0, 0);

      const runId = await this.schedulePublish(slug, {
        ...spec,
        introVoiceoverText: introScript(slug, spec.durationMinutes),
      });
      runIds.push(runId);

      if (adapters.creatomate && templateId) {
        const render = await adapters.creatomate.renderAndWait({
          templateId,
          modifications: buildCreatomatePayload(spec),
        });
        await createSupabaseAdmin()
          .from("production_runs")
          .update({
            metadata: {
              creatomate: buildCreatomatePayload(spec),
              channelSlug: slug,
              creatomateRenderId: render.id,
              creatomateUrl: render.url,
              tier: "volume",
            },
          })
          .eq("id", runId);
      }

      if (adapters.publishers.youtube) {
        await adapters.publishers.youtube.publish({
          title: `${slug} — Day ${day + 1}`,
          description: JSON.stringify(buildCreatomatePayload(spec)),
          mediaUri: spec.visualLoopUri,
          scheduledAt,
          tags: [slug, "faceless", "westbound"],
        });
      } else {
        await enqueueJob(
          "youtube.assemble_video",
          { channelSlug: slug, day, runId },
          { productionRunId: runId }
        );
      }
    }

    return runIds;
  }
}
