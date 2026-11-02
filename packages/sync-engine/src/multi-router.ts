import { createRepository, enqueueJob, logger } from "@westbound/platform";

/** Hack 4: route one track to all monetization surfaces */
export async function routeTrackToEngines(trackId: string): Promise<void> {
  const repo = createRepository();
  const track = await repo.getTrack(trackId);
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
  // Every other route is safe for a brand-new generated track; a release to distributors is not. It waits for approval
  // (the release job itself also refuses an unapproved track, which used to dead-letter it after three attempts).
  if (eligibility.dsp_release && track.metadata.qaStatus === "approved") {
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
