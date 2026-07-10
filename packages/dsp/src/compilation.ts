import { createRepository, createSupabaseAdmin, logger } from "@westbound/platform";
import { DistroKidPublisher } from "@westbound/adapters";

/** Monthly compilation: bundle top unreleased sync tracks into a DistroKid album */
export async function runCompilationBatch(limit = 10): Promise<string[]> {
  const repo = createRepository();
  const db = createSupabaseAdmin();
  const tracks = await repo.listTracks({ source: "sync" });
  const candidates = tracks
    .filter(
      (t) =>
        Number(t.metadata.briefScore ?? 0) >= 85 &&
        t.metadata.qaStatus === "approved" &&
        !t.metadata.compilationReleased
    )
    .sort((a, b) => Number(b.metadata.briefScore ?? 0) - Number(a.metadata.briefScore ?? 0))
    .slice(0, limit);

  if (candidates.length === 0) {
    logger.info("No compilation candidates");
    return [];
  }

  const apiKey = process.env.DISTROKID_API_KEY;
  const releaseIds: string[] = [];
  const title = `Westbound Sync Vol. ${new Date().toISOString().slice(0, 7)}`;

  if (apiKey) {
    const publisher = new DistroKidPublisher(apiKey);
    for (const track of candidates) {
      try {
        const result = await publisher.publish({
          title: track.title,
          description: String(track.metadata.description ?? "Instrumental sync catalog"),
          mediaUri: String(track.metadata.audioUri ?? ""),
          scheduledAt: new Date(),
          ddexAiDisclosure: "AI-assisted, human-curated",
          artistName: "Westbound Studios",
        });
        await db
          .from("tracks")
          .update({
            metadata: {
              ...track.metadata,
              compilationReleased: true,
              distrokidId: result.externalId,
            },
          })
          .eq("id", track.id);
        releaseIds.push(result.externalId);
      } catch (e) {
        logger.error("Compilation track publish failed", {
          trackId: track.id,
          error: String(e),
        });
      }
    }
  } else {
    logger.info("DistroKid stub compilation", { title, trackCount: candidates.length });
    for (const track of candidates) {
      await db
        .from("tracks")
        .update({
          metadata: { ...track.metadata, compilationReleased: true },
        })
        .eq("id", track.id);
      releaseIds.push(`stub_compilation_${track.id.slice(0, 8)}`);
    }
  }

  return releaseIds;
}
