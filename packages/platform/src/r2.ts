import { createHash } from "node:crypto";
import {
  DeleteObjectCommand,
  GetObjectCommand,
  HeadBucketCommand,
  HeadObjectCommand,
  PutObjectCommand,
  S3Client,
} from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { loadEnv } from "./config.js";

export interface R2Config {
  accountId: string;
  accessKeyId: string;
  secretAccessKey: string;
  bucketName: string;
  publicUrl?: string;
}

export function getR2Config(): R2Config {
  const env = loadEnv();
  if (!env.R2_ACCOUNT_ID || !env.R2_ACCESS_KEY_ID || !env.R2_SECRET_ACCESS_KEY) {
    throw new Error("R2 credentials not configured");
  }
  return {
    accountId: env.R2_ACCOUNT_ID,
    accessKeyId: env.R2_ACCESS_KEY_ID,
    secretAccessKey: env.R2_SECRET_ACCESS_KEY,
    bucketName: env.R2_BUCKET_NAME,
    publicUrl: env.R2_PUBLIC_URL,
  };
}

export function createR2Client(config: R2Config): S3Client {
  return new S3Client({
    region: "auto",
    endpoint: `https://${config.accountId}.r2.cloudflarestorage.com`,
    credentials: {
      accessKeyId: config.accessKeyId,
      secretAccessKey: config.secretAccessKey,
    },
  });
}

export function buildAssetKey(parts: {
  project: string;
  entity: string;
  version: number;
  filename: string;
}): string {
  const safe = (s: string) => s.replace(/[^a-zA-Z0-9._-]/g, "_");
  return [
    safe(parts.project),
    safe(parts.entity),
    `v${parts.version}`,
    safe(parts.filename),
  ].join("/");
}

export class AssetStorage {
  constructor(
    private readonly client: S3Client,
    private readonly config: R2Config
  ) {}

  static async fromEnv(): Promise<AssetStorage> {
    const config = getR2Config();
    const client = createR2Client(config);
    await client.send(new HeadBucketCommand({ Bucket: config.bucketName }));
    return new AssetStorage(client, config);
  }

  async upload(
    key: string,
    body: Buffer | Uint8Array,
    contentType: string
  ): Promise<string> {
    await this.client.send(
      new PutObjectCommand({
        Bucket: this.config.bucketName,
        Key: key,
        Body: body,
        ContentType: contentType,
        CacheControl: "public, max-age=31536000, immutable",
      })
    );
    return `r2://${this.config.bucketName}/${key}`;
  }

  async uploadWithDedup(
    body: Buffer | Uint8Array,
    contentType: string,
    ext: string
  ): Promise<string> {
    const hash = createHash("sha256").update(body).digest("hex");
    const key = `dedup/${hash}.${ext.replace(/^\./, "")}`;
    try {
      await this.client.send(
        new HeadObjectCommand({ Bucket: this.config.bucketName, Key: key })
      );
      return `r2://${this.config.bucketName}/${key}`;
    } catch {
      return this.upload(key, body, contentType);
    }
  }

  async getSignedDownloadUrl(key: string, expiresIn = 3600): Promise<string> {
    const command = new GetObjectCommand({
      Bucket: this.config.bucketName,
      Key: key,
    });
    return getSignedUrl(this.client, command, { expiresIn });
  }

  async delete(key: string): Promise<void> {
    await this.client.send(
      new DeleteObjectCommand({
        Bucket: this.config.bucketName,
        Key: key,
      })
    );
  }

  keyFromUri(r2Uri: string): string {
    const prefix = `r2://${this.config.bucketName}/`;
    if (!r2Uri.startsWith(prefix)) {
      throw new Error(`Invalid R2 URI: ${r2Uri}`);
    }
    return r2Uri.slice(prefix.length);
  }
}
