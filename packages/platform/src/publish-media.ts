const MISSING_MEDIA_MESSAGE =
  "No resolveMasterUri (or episodeVideoUri) on run — upload the mastered file via /review before publish";

function usableUri(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed ? trimmed : null;
}

/**
 * Publish media for a production run, or null when there is none yet.
 * Prefers Dan's Logic/Resolve master (S3) over the generated episode video.
 * Only non-empty strings count; a stray number/object is not a URI.
 */
export function findPublishMediaUri(
  metadata: Record<string, unknown> | null | undefined
): string | null {
  return usableUri(metadata?.resolveMasterUri) ?? usableUri(metadata?.episodeVideoUri);
}

/** Resolve the publish media URI; throws when the run has no master or episode video. */
export function resolvePublishMediaUri(
  metadata: Record<string, unknown> | null | undefined
): string {
  const uri = findPublishMediaUri(metadata);
  if (!uri) throw new Error(MISSING_MEDIA_MESSAGE);
  return uri;
}
