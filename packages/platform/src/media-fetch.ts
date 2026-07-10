import { randomUUID } from "node:crypto";
import { AssetStorage, buildAssetKey, getR2Config } from "./r2.js";
import { logger } from "./logging.js";

const CONTENT_TYPE_EXT: Record<string, string> = {
  "audio/wav": "wav",
  "audio/mpeg": "mp3",
  "video/mp4": "mp4",
  "image/png": "png",
  "image/jpeg": "jpg",
};

/** Download bytes from http(s), r2://, or stub:// URIs */
export async function fetchProviderUri(uri: string): Promise<Buffer> {
  if (!uri || uri.startsWith("stub://") || uri.startsWith("local://")) {
    return Buffer.from(`stub-content:${uri}`);
  }

  if (uri.startsWith("r2://")) {
    try {
      const config = getR2Config();
      const prefix = `r2://${config.bucketName}/`;
      if (!uri.startsWith(prefix)) {
        throw new Error(`R2 URI bucket mismatch: ${uri}`);
      }
      const key = uri.slice(prefix.length);
      const storage = await AssetStorage.fromEnv();
      const signed = await storage.getSignedDownloadUrl(key, 3600);
      const res = await fetch(signed, { signal: AbortSignal.timeout(120_000) });
      if (!res.ok) throw new Error(`R2 download ${res.status}`);
      return Buffer.from(await res.arrayBuffer());
    } catch (e) {
      logger.warn("R2 fetch failed, using stub buffer", { uri, error: String(e) });
      return Buffer.from(`stub-r2:${uri}`);
    }
  }

  if (uri.startsWith("http://") || uri.startsWith("https://")) {
    const res = await fetch(uri, { signal: AbortSignal.timeout(120_000) });
    if (!res.ok) {
      throw new Error(`HTTP fetch failed ${res.status} for ${uri.slice(0, 80)}`);
    }
    return Buffer.from(await res.arrayBuffer());
  }

  return Buffer.from(`unknown-uri:${uri}`);
}

export interface UploadMediaOptions {
  projectSlug: string;
  entitySlug: string;
  filename?: string;
  contentType: string;
  version?: number;
}

/** Fetch provider URI and upload to R2; returns r2:// URI */
export async function fetchAndUploadToR2(
  sourceUri: string,
  options: UploadMediaOptions
): Promise<string> {
  const body = await fetchProviderUri(sourceUri);
  const ext =
    CONTENT_TYPE_EXT[options.contentType] ??
    options.filename?.split(".").pop() ??
    "bin";
  const filename = options.filename ?? `${randomUUID()}.${ext}`;
  const version = options.version ?? 1;

  try {
    const storage = await AssetStorage.fromEnv();
    const key = buildAssetKey({
      project: options.projectSlug,
      entity: options.entitySlug,
      version,
      filename,
    });
    return storage.upload(key, body, options.contentType);
  } catch {
    return `local://${options.projectSlug}/${options.entitySlug}/v${version}/${filename}`;
  }
}

export function guessContentType(uri: string, fallback: string): string {
  const lower = uri.toLowerCase();
  if (lower.endsWith(".wav")) return "audio/wav";
  if (lower.endsWith(".mp3")) return "audio/mpeg";
  if (lower.endsWith(".mp4")) return "video/mp4";
  if (lower.endsWith(".png")) return "image/png";
  if (lower.endsWith(".jpg") || lower.endsWith(".jpeg")) return "image/jpeg";
  return fallback;
}
