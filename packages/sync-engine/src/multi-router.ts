import { createRepository, enqueueJob, logger } from "@westbound/platform";

/** Hack 4: route one track to all monetization surfaces */
export async function routeTrackToEngines(trackId: string): Promise<void> {
  const repo = createRepository();
  const tracks = await repo.listTracks();
  const track = tracks.find((t) => t.id === trackId);
  if (!track) throw new Error(`Track not found: ${trackId}`);

  const eligibility = (track.metadata.multi_engine_eligibility as Record<string, boolean>) ?? {
    youtube_bed: true,
    dsp_release: true,
    content_id: true,
    compilation: true,
  };

  if (eligibility.youtube_bed) {
    await enqueueJob("youtube.assemble_video", {
      trackId,
      mode: "bed_eligible",
    });
  }
  if (eligibility.dsp_release) {
    await enqueueJob("dsp.release_candidate", { trackId });
  }
  if (eligibility.content_id) {
    await enqueueJob("identifyy.register", { trackId });
  }
  if (eligibility.compilation) {
    await enqueueJob("dsp.compilation_batch", { trackId, defer: true });
  }

  logger.info("Multi-engine route enqueued", { trackId });
}
