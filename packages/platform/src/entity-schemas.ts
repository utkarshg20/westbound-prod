import { z } from "zod";
import {
  AssetTypeSchema,
  ProductionStageSchema,
  QaStatusSchema,
  TrackSourceSchema,
} from "./types.js";

export const ProjectSchema = z.object({
  id: z.string().uuid(),
  slug: z.string(),
  name: z.string(),
  created_at: z.string(),
});

export const TrackSchema = z.object({
  id: z.string().uuid(),
  project_id: z.string().uuid(),
  production_run_id: z.string().uuid().nullable(),
  source: TrackSourceSchema,
  title: z.string(),
  isrc: z.string().nullable(),
  asset_id: z.string().uuid().nullable(),
  mood_tags: z.array(z.string()),
  metadata: z.record(z.unknown()),
});

export const AssetSchema = z.object({
  id: z.string().uuid(),
  project_id: z.string().uuid(),
  character_id: z.string().uuid().nullable(),
  parent_id: z.string().uuid().nullable(),
  type: AssetTypeSchema,
  r2_uri: z.string(),
  version: z.number(),
  tool: z.string().nullable(),
  prompt_hash: z.string().nullable(),
  qa_status: QaStatusSchema,
  tags: z.array(z.string()),
  metadata: z.record(z.unknown()),
  created_at: z.string(),
});

export const ProductionRunSchema = z.object({
  id: z.string().uuid(),
  project_id: z.string().uuid(),
  kind: z.enum(["episode", "song", "sync_batch", "youtube_video"]),
  title: z.string(),
  stage: ProductionStageSchema,
  status: z.enum(["active", "completed", "failed"]),
  cost_cents: z.number(),
  metadata: z.record(z.unknown()),
  created_at: z.string(),
  updated_at: z.string(),
});

export const SignalSchema = z.object({
  id: z.string().uuid(),
  source: z.string(),
  external_id: z.string().nullable(),
  mood: z.string().nullable(),
  bpm_min: z.number().nullable(),
  bpm_max: z.number().nullable(),
  genre: z.string().nullable(),
  deadline: z.string().nullable(),
  raw_payload: z.record(z.unknown()),
  processed_at: z.string().nullable(),
  created_at: z.string(),
});

export const PlatformSchema = z.enum([
  "spotify",
  "apple_music",
  "youtube",
  "youtube_music",
  "songtradr",
  "pond5",
  "tiktok",
]);

export const MoodTagSchema = z
  .string()
  .min(1)
  .max(40)
  .transform((s) => s.toLowerCase());
