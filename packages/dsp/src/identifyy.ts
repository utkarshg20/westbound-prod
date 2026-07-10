import { fetchProviderUri } from "@westbound/platform";
import { createRepository, createSupabaseAdmin, logger } from "@westbound/platform";

export interface IdentifyyRegisterResult {
  trackId: string;
  registered: boolean;
  externalId?: string;
}

/**
 * Register a sync or Sammy track with Identifyy Content ID.
 * Uses IDENTIFYY_API_KEY when set; otherwise logs and marks metadata.
 */
export async function registerIdentifyyContentId(
  trackId: string
): Promise<IdentifyyRegisterResult> {
  const repo = createRepository();
  const tracks = await repo.listTracks();
  const track = tracks.find((t) => t.id === trackId);
  if (!track) throw new Error(`Track not found: ${trackId}`);

  const audioUri = String(track.metadata.audioUri ?? "");
  if (!audioUri) throw new Error(`Track ${trackId} missing audioUri`);

  const apiKey = process.env.IDENTIFYY_API_KEY;
  let externalId: string | undefined;

  if (apiKey) {
    const audio = await fetchProviderUri(audioUri);
    const res = await fetch("https://api.identifyy.com/v1/fingerprints", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/octet-stream",
      },
      body: audio,
      signal: AbortSignal.timeout(120_000),
    });
    if (!res.ok) {
      throw new Error(`Identifyy register failed ${res.status}`);
    }
    const data = (await res.json()) as { id?: string };
    externalId = data.id;
  } else {
    logger.info("Identifyy stub registration", { trackId, audioUri: audioUri.slice(0, 60) });
    externalId = `identifyy_stub_${trackId.slice(0, 8)}`;
  }

  const db = createSupabaseAdmin();
  await db
    .from("tracks")
    .update({
      metadata: {
        ...track.metadata,
        identifyy_registered: true,
        identifyy_id: externalId,
        identifyy_registered_at: new Date().toISOString(),
      },
    })
    .eq("id", trackId);

  return { trackId, registered: true, externalId };
}
