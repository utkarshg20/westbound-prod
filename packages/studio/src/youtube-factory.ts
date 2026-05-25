import { createAdapterRegistry } from "@westbound/adapters";
import { createRepository, createSupabaseAdmin, enqueueJob } from "@westbound/platform";

export const CHANNEL_THEMES = [
  { slug: "ambient", tags: ["ambient", "calm", "atmospheric"] },
  { slug: "lofi", tags: ["lofi", "chill", "study"] },
  { slug: "rain_rock", tags: ["rock", "rain", "moody"] },
  { slug: "campfire_country", tags: ["country", "acoustic", "warm"] },
  { slug: "neon_city", tags: ["synth", "night", "urban"] },
] as const;

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
      duration_minutes: spec.durationMinutes,
    },
  };
}

export function introScript(channelSlug: string, durationMinutes: number): string {
  const names: Record<string, string> = {
    ambient: "Deep Ambient",
    lofi: "Lofi Focus",
    rain_rock: "Rain Rock",
    campfire_country: "Campfire Country",
    neon_city: "Neon City Nights",
  };
  const name = names[channelSlug] ?? channelSlug;
  return `Welcome to ${name} — ${durationMinutes} minutes of music to carry you through.`;
}

export class YouTubeFactory {
  async assembleDailyVideo(channelSlug: string): Promise<FacelessVideoSpec> {
    const repo = createRepository();
    const tracks = await repo.listTracks({ source: "sync" });
    const theme = CHANNEL_THEMES.find((t) => t.slug === channelSlug);
    const tagged = tracks.filter((t) =>
      theme?.tags.some((tag) => t.mood_tags.includes(tag))
    );
    const selected = tagged.slice(0, 25).map((t) => String(t.metadata.audioUri ?? ""));

    return {
      channelSlug,
      trackUris: selected.length ? selected : ["stub://placeholder_track"],
      visualLoopUri: `r2://westbound-assets/youtube/loops/${channelSlug}_loop.mp4`,
      introVoiceoverText: introScript(channelSlug, 60),
      durationMinutes: 60,
    };
  }

  async schedulePublish(
    channelSlug: string,
    spec: FacelessVideoSpec
  ): Promise<string> {
    const db = createSupabaseAdmin();
    const projects = await createRepository().listProjects();
    const yt = projects.find((p) => p.slug === "youtube_faceless");

    const { data: run } = await db
      .from("production_runs")
      .insert({
        project_id: yt?.id,
        kind: "youtube_video",
        title: `${channelSlug} — ${new Date().toISOString().slice(0, 10)}`,
        stage: "scheduled",
        metadata: {
          tier: "volume",
          creatomate: buildCreatomatePayload(spec),
          channelSlug,
        },
      })
      .select()
      .single();

    return run?.id ?? "";
  }

  async runSingleChannelProof(channelSlug = "lofi"): Promise<string> {
    const spec = await this.assembleDailyVideo(channelSlug);
    return this.schedulePublish(channelSlug, spec);
  }

  /**
   * Schedule 14 daily faceless videos (1 channel proof).
   * Uses Creatomate publisher when configured; enqueues worker jobs otherwise.
   */
  async schedule14DayProof(channelSlug = "lofi"): Promise<string[]> {
    const runIds: string[] = [];
    const adapters = createAdapterRegistry();
    const templateId = process.env.CREATOMATE_TEMPLATE_FACELESS;

    for (let day = 0; day < 14; day++) {
      const spec = await this.assembleDailyVideo(channelSlug);
      const scheduledAt = new Date();
      scheduledAt.setDate(scheduledAt.getDate() + day);
      scheduledAt.setHours(8, 0, 0, 0);

      const runId = await this.schedulePublish(channelSlug, {
        ...spec,
        introVoiceoverText: introScript(channelSlug, spec.durationMinutes),
      });
      runIds.push(runId);

      if (adapters.creatomate && templateId) {
        await adapters.creatomate.render({
          templateId,
          modifications: buildCreatomatePayload(spec),
        });
      }

      if (adapters.publishers.youtube) {
        await adapters.publishers.youtube.publish({
          title: `${channelSlug} — Day ${day + 1}`,
          description: JSON.stringify(buildCreatomatePayload(spec)),
          mediaUri: spec.visualLoopUri,
          scheduledAt,
          tags: [channelSlug, "faceless", "westbound"],
        });
      } else {
        await enqueueJob(
          "youtube.assemble_video",
          { channelSlug, day, runId },
          { productionRunId: runId }
        );
      }
    }

    return runIds;
  }
}
