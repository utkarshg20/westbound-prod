import {
  AssetStorage,
  buildAssetKey,
  createRepository,
  fetchAndUploadToR2,
  fetchProviderUri,
  type Asset,
  type AssetType,
} from "@westbound/platform";
import { createHash } from "node:crypto";

export interface IngestAssetInput {
  projectSlug: string;
  entitySlug: string;
  characterId?: string;
  parentId?: string;
  type: AssetType;
  filename: string;
  body: Buffer;
  contentType: string;
  tool?: string;
  prompt?: string;
  tags?: string[];
  metadata?: Record<string, unknown>;
  sourceUri?: string;
}

export class AssetLibrary {
  constructor(
    private readonly repo = createRepository(),
    private readonly storage: AssetStorage | null = null
  ) {}

  static async create(): Promise<AssetLibrary> {
    let storage: AssetStorage | null = null;
    try {
      storage = await AssetStorage.fromEnv();
    } catch {
      storage = null;
    }
    return new AssetLibrary(createRepository(), storage);
  }

  async ingest(input: IngestAssetInput): Promise<Asset> {
    const projects = await this.repo.listProjects();
    const project = projects.find((p) => p.slug === input.projectSlug);
    if (!project) throw new Error(`Project not found: ${input.projectSlug}`);

    const existing = await this.repo.listAssets({
      projectId: project.id,
      characterId: input.characterId,
    });
    const sameEntity = existing.filter((a) =>
      a.r2_uri.includes(`/${input.entitySlug}/`)
    );
    const version =
      sameEntity.length > 0
        ? Math.max(...sameEntity.map((a) => a.version)) + 1
        : 1;

    const key = buildAssetKey({
      project: input.projectSlug,
      entity: input.entitySlug,
      version,
      filename: input.filename,
    });

    let body = input.body;
    if (input.sourceUri && body.length === 0) {
      body = await fetchProviderUri(input.sourceUri);
    }

    let r2Uri = `local://${key}`;
    if (this.storage) {
      if (input.sourceUri && !input.body.length) {
        r2Uri = await fetchAndUploadToR2(input.sourceUri, {
          projectSlug: input.projectSlug,
          entitySlug: input.entitySlug,
          filename: input.filename,
          contentType: input.contentType,
          version,
        });
      } else {
        r2Uri = await this.storage.upload(key, body, input.contentType);
      }
    }

    const promptHash = input.prompt
      ? createHash("sha256").update(input.prompt).digest("hex").slice(0, 16)
      : null;

    return this.repo.createAsset({
      project_id: project.id,
      character_id: input.characterId ?? null,
      parent_id: input.parentId ?? null,
      type: input.type,
      r2_uri: r2Uri,
      version,
      tool: input.tool ?? null,
      prompt_hash: promptHash,
      qa_status: "pending",
      tags: input.tags ?? [],
      metadata: {
        ...input.metadata,
        entitySlug: input.entitySlug,
        contentType: input.contentType,
      },
    });
  }

  async search(projectSlug: string, query: string): Promise<Asset[]> {
    const projects = await this.repo.listProjects();
    const project = projects.find((p) => p.slug === projectSlug);
    if (!project) return [];

    const assets = await this.repo.listAssets({ projectId: project.id });
    const q = query.toLowerCase();
    return assets.filter(
      (a) =>
        a.tags.some((t) => t.toLowerCase().includes(q)) ||
        JSON.stringify(a.metadata).toLowerCase().includes(q)
    );
  }

  async approve(assetId: string): Promise<void> {
    const { createSupabaseAdmin } = await import("@westbound/platform");
    const db = createSupabaseAdmin();
    const { error } = await db
      .from("assets")
      .update({ qa_status: "approved" })
      .eq("id", assetId);
    if (error) throw error;
  }
}
