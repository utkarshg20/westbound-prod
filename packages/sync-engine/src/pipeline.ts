import { createAdapterRegistry } from "@westbound/adapters";
import {
  createLlmClient,
  scoreBriefVariant,
  signalToSunoPrompt,
  tagTrackMetadata,
} from "@westbound/agents";
import { createRepository, createSupabaseAdmin } from "@westbound/platform";

export class SyncEngine {
  private readonly repo = createRepository();
  private readonly adapters = createAdapterRegistry();

  async runSignalIngest(): Promise<number> {
    const { ingestDailySignals } = await import("./signals.js");
    return ingestDailySignals();
  }

  async runGenerateBatch(limit = 5): Promise<string[]> {
    const signals = (await this.repo.listSignals(true)).slice(0, limit);
    const llm = await createLlmClient();
    const projects = await this.repo.listProjects();
    const syncProject = projects.find((p) => p.slug === "sync_factory");
    if (!syncProject) throw new Error("sync_factory project missing");

    const trackIds: string[] = [];

    for (const signal of signals) {
      const suno = await signalToSunoPrompt(llm, signal);
      if (!suno) continue;

      const variations = await this.adapters.music.generate({
        prompt: suno.prompt,
        instrumental: suno.instrumental,
        variations: 4,
      });

      for (let vi = 0; vi < variations.length; vi++) {
        const v = variations[vi]!;
        const meta = await tagTrackMetadata(
          llm,
          `Sync ${v.id.slice(0, 8)}`,
          suno.prompt
        );
        if (!meta) continue;

        const briefScore = await scoreBriefVariant(
          llm,
          signal.raw_payload,
          { ...meta, sunoPrompt: suno, variantIndex: vi }
        );

        if (briefScore.discard) continue;

        const track = await this.repo.createTrack({
          project_id: syncProject.id,
          production_run_id: null,
          source: "sync",
          title: meta.description.slice(0, 80),
          isrc: null,
          asset_id: null,
          mood_tags: meta.mood,
          metadata: {
            ...meta,
            sunoPrompt: suno,
            audioUri: v.uri,
            disclosure: "AI-assisted, human-curated",
            qaStatus: briefScore.holdForDan
              ? "hold_for_dan"
              : briefScore.passed
                ? "pending_curation"
                : "pending_curation",
            briefScore: briefScore.total,
            rubricBreakdown: briefScore.breakdown,
            signalId: signal.id,
            variantIndex: vi,
          },
        });
        trackIds.push(track.id);
      }

      await this.repo.markSignalProcessed(signal.id);
    }

    return trackIds;
  }

  async submitToCurationQueue(trackIds: string[]): Promise<void> {
    const db = createSupabaseAdmin();
    for (const id of trackIds) {
      await db
        .from("tracks")
        .update({
          metadata: {
            qaStatus: "pending_curation",
            curationQueue: true,
          },
        })
        .eq("id", id);
    }
  }

  async uploadApprovedTracks(trackIds: string[]): Promise<void> {
    const publisher = this.adapters.publishers.songtradr;
    for (const id of trackIds) {
      const tracks = await this.repo.listTracks({ source: "sync" });
      const track = tracks.find((t) => t.id === id);
      if (!track) continue;
      await publisher.publish({
        title: track.title,
        description: String(track.metadata.description ?? ""),
        mediaUri: String(track.metadata.audioUri ?? ""),
        tags: track.mood_tags,
      });
      await createSupabaseAdmin()
        .from("tracks")
        .update({ metadata: { ...track.metadata, uploaded: true } })
        .eq("id", id);
    }
  }
}
