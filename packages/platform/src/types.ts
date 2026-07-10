import { z } from "zod";

export const KNOWN_PROJECT_SLUGS = [
  "studio",
  "sync_factory",
  "youtube_faceless",
] as const;

/** Extensible slug shape — new projects via DB insert, no redeploy */
export const ProjectSlugSchema = z
  .string()
  .regex(/^[a-z][a-z0-9_]{2,40}$/);
export type ProjectSlug = z.infer<typeof ProjectSlugSchema>;

export const AssetTypeSchema = z.enum([
  "image",
  "video",
  "audio",
  "lora",
  "document",
  "other",
]);
export type AssetType = z.infer<typeof AssetTypeSchema>;

export const QaStatusSchema = z.enum([
  "pending",
  "approved",
  "rejected",
  "flagged",
]);
export type QaStatus = z.infer<typeof QaStatusSchema>;

export const ProductionStageSchema = z.enum([
  "draft",
  "generating",
  "assets_ready",
  "dan_review",
  "scheduled",
  "published",
  "dsp_live",
  "failed",
]);
export type ProductionStage = z.infer<typeof ProductionStageSchema>;

export const TrackSourceSchema = z.enum(["sync", "sammy", "yt"]);
export type TrackSource = z.infer<typeof TrackSourceSchema>;

export const JobTypeSchema = z.enum([
  "studio.generate_episode",
  "studio.ingest_asset",
  "studio.trend_hijack",
  "studio.render_shorts",
  "sync.signal_ingest",
  "sync.generate_batch",
  "sync.upload_track",
  "sync.brief_match",
  "sync.supervisor_outreach",
  "youtube.assemble_video",
  "youtube.publish",
  "youtube.enqueue_channel_video",
  "youtube.title_thumb_rotate",
  "track.multi_route",
  "dsp.release_candidate",
  "dsp.compilation_batch",
  "identifyy.register",
  "agent.continuity_check",
  "agent.metadata_tag",
]);
export type JobType = z.infer<typeof JobTypeSchema>;

export type QueueDomain = "sync" | "studio" | "agent";

export function jobQueueDomain(type: JobType): QueueDomain {
  if (type.startsWith("sync.")) return "sync";
  if (type.startsWith("agent.")) return "agent";
  return "studio";
}

export const JOB_PRIORITY: Partial<Record<JobType, number>> = {
  "studio.trend_hijack": 1,
  "studio.generate_episode": 1,
  "sync.generate_batch": 5,
  "track.multi_route": 10,
  "youtube.assemble_video": 10,
  "youtube.enqueue_channel_video": 10,
};

export interface Project {
  id: string;
  slug: ProjectSlug;
  name: string;
  created_at: string;
}

export interface Character {
  id: string;
  project_id: string;
  slug: string;
  display_name: string;
  hero_asset_id: string | null;
  lora_version: string | null;
  metadata: Record<string, unknown>;
}

export interface Asset {
  id: string;
  project_id: string;
  character_id: string | null;
  parent_id: string | null;
  type: AssetType;
  r2_uri: string;
  version: number;
  tool: string | null;
  prompt_hash: string | null;
  qa_status: QaStatus;
  tags: string[];
  metadata: Record<string, unknown>;
  created_at: string;
}

export interface ProductionRun {
  id: string;
  project_id: string;
  kind: "episode" | "song" | "sync_batch" | "youtube_video";
  title: string;
  stage: ProductionStage;
  status: "active" | "completed" | "failed";
  cost_cents: number;
  metadata: Record<string, unknown>;
  created_at: string;
  updated_at: string;
}

export interface Signal {
  id: string;
  source: string;
  external_id: string | null;
  mood: string | null;
  bpm_min: number | null;
  bpm_max: number | null;
  genre: string | null;
  deadline: string | null;
  raw_payload: Record<string, unknown>;
  processed_at: string | null;
  created_at: string;
}

export interface Track {
  id: string;
  project_id: string;
  production_run_id: string | null;
  source: TrackSource;
  title: string;
  isrc: string | null;
  asset_id: string | null;
  mood_tags: string[];
  metadata: Record<string, unknown>;
}

export interface Release {
  id: string;
  production_run_id: string;
  track_id: string | null;
  scheduled_at: string | null;
  published_at: string | null;
  platforms: string[];
  stage: ProductionStage;
}

export interface RevenueEvent {
  id: string;
  project_id: string;
  platform: string;
  amount_cents: number;
  currency: string;
  track_id: string | null;
  period_month: string;
  metadata: Record<string, unknown>;
}

export interface StoryBeat {
  id: string;
  project_id: string;
  episode_number: number | null;
  title: string;
  summary: string;
  script_excerpt: string | null;
  canon_constraints: string[];
  metadata: Record<string, unknown>;
}

export interface SongDropWindow {
  id: string;
  production_run_id: string | null;
  window_start: string;
  window_end: string;
  trigger_type: "story" | "random" | "manual";
  released: boolean;
}
