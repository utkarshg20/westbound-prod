import { createClient, SupabaseClient } from "@supabase/supabase-js";
import type {
  Asset,
  Character,
  ProductionRun,
  Project,
  Release,
  RevenueEvent,
  Signal,
  StoryBeat,
  Track,
} from "./types.js";
import { getSupabaseUrl, loadEnv } from "./config.js";

export type Database = {
  public: {
    Tables: Record<string, unknown>;
  };
};

export function createSupabaseAdmin(): SupabaseClient {
  const env = loadEnv();
  const url = getSupabaseUrl(env);
  const key = env.SUPABASE_SERVICE_ROLE_KEY;
  if (!key) throw new Error("Missing SUPABASE_SERVICE_ROLE_KEY");
  return createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

export class WestboundRepository {
  constructor(private readonly db: SupabaseClient) {}

  async listProjects(): Promise<Project[]> {
    const { data, error } = await this.db.from("projects").select("*");
    if (error) throw error;
    return data as Project[];
  }

  async getProductionRun(id: string): Promise<ProductionRun | null> {
    const { data, error } = await this.db
      .from("production_runs")
      .select("*")
      .eq("id", id)
      .maybeSingle();
    if (error) throw error;
    return data as ProductionRun | null;
  }

  async updateProductionStage(
    id: string,
    stage: ProductionRun["stage"],
    status?: ProductionRun["status"]
  ): Promise<ProductionRun> {
    const patch: Record<string, unknown> = {
      stage,
      updated_at: new Date().toISOString(),
    };
    if (status) patch.status = status;
    const { data, error } = await this.db
      .from("production_runs")
      .update(patch)
      .eq("id", id)
      .select()
      .single();
    if (error) throw error;
    return data as ProductionRun;
  }

  async listProductionRuns(projectId?: string): Promise<ProductionRun[]> {
    let q = this.db.from("production_runs").select("*").order("updated_at", {
      ascending: false,
    });
    if (projectId) q = q.eq("project_id", projectId);
    const { data, error } = await q;
    if (error) throw error;
    return data as ProductionRun[];
  }

  async createAsset(
    input: Omit<Asset, "id" | "created_at">
  ): Promise<Asset> {
    const { data, error } = await this.db
      .from("assets")
      .insert(input)
      .select()
      .single();
    if (error) throw error;
    return data as Asset;
  }

  async listAssets(filters?: {
    projectId?: string;
    characterId?: string;
    qaStatus?: Asset["qa_status"];
    tags?: string[];
  }): Promise<Asset[]> {
    let q = this.db.from("assets").select("*").order("created_at", {
      ascending: false,
    });
    if (filters?.projectId) q = q.eq("project_id", filters.projectId);
    if (filters?.characterId) q = q.eq("character_id", filters.characterId);
    if (filters?.qaStatus) q = q.eq("qa_status", filters.qaStatus);
    if (filters?.tags?.length) q = q.contains("tags", filters.tags);
    const { data, error } = await q;
    if (error) throw error;
    return data as Asset[];
  }

  async listCharacters(projectId: string): Promise<Character[]> {
    const { data, error } = await this.db
      .from("characters")
      .select("*")
      .eq("project_id", projectId);
    if (error) throw error;
    return data as Character[];
  }

  async listSignals(unprocessedOnly = false): Promise<Signal[]> {
    let q = this.db.from("signals").select("*").order("created_at", {
      ascending: false,
    });
    if (unprocessedOnly) q = q.is("processed_at", null);
    const { data, error } = await q;
    if (error) throw error;
    return data as Signal[];
  }

  async markSignalProcessed(id: string): Promise<void> {
    const { error } = await this.db
      .from("signals")
      .update({ processed_at: new Date().toISOString() })
      .eq("id", id);
    if (error) throw error;
  }

  async createTrack(
    input: Omit<Track, "id">
  ): Promise<Track> {
    const { data, error } = await this.db
      .from("tracks")
      .insert(input)
      .select()
      .single();
    if (error) throw error;
    return data as Track;
  }

  async listTracks(filters?: {
    source?: Track["source"];
    projectId?: string;
  }): Promise<Track[]> {
    let q = this.db.from("tracks").select("*");
    if (filters?.source) q = q.eq("source", filters.source);
    if (filters?.projectId) q = q.eq("project_id", filters.projectId);
    const { data, error } = await q;
    if (error) throw error;
    return data as Track[];
  }

  async listReleases(): Promise<Release[]> {
    const { data, error } = await this.db
      .from("releases")
      .select("*")
      .order("scheduled_at", { ascending: true });
    if (error) throw error;
    return data as Release[];
  }

  async listRevenueEvents(projectId?: string): Promise<RevenueEvent[]> {
    let q = this.db.from("revenue_events").select("*");
    if (projectId) q = q.eq("project_id", projectId);
    const { data, error } = await q;
    if (error) throw error;
    return data as RevenueEvent[];
  }

  async listStoryBeats(projectId: string): Promise<StoryBeat[]> {
    const { data, error } = await this.db
      .from("story_beats")
      .select("*")
      .eq("project_id", projectId)
      .order("episode_number", { ascending: true });
    if (error) throw error;
    return data as StoryBeat[];
  }

  async addJobCost(productionRunId: string, costCents: number): Promise<void> {
    const run = await this.getProductionRun(productionRunId);
    if (!run) throw new Error(`Production run not found: ${productionRunId}`);
    const { error } = await this.db
      .from("production_runs")
      .update({
        cost_cents: run.cost_cents + costCents,
        updated_at: new Date().toISOString(),
      })
      .eq("id", productionRunId);
    if (error) throw error;
  }
}

export function createRepository(): WestboundRepository {
  return new WestboundRepository(createSupabaseAdmin());
}
