import { z } from "zod";

const envSchema = z.object({
  NEXT_PUBLIC_SUPABASE_URL: z.string().url().optional(),
  SUPABASE_URL: z.string().url().optional(),
  SUPABASE_SERVICE_ROLE_KEY: z.string().min(1).optional(),
  R2_ACCOUNT_ID: z.string().optional(),
  R2_ACCESS_KEY_ID: z.string().optional(),
  R2_SECRET_ACCESS_KEY: z.string().optional(),
  R2_BUCKET_NAME: z.string().default("westbound-assets"),
  R2_PUBLIC_URL: z.string().url().optional(),
  REDIS_URL: z.string().default("redis://localhost:6379"),
  ANTHROPIC_API_KEY: z.string().optional(),
  USE_STUB_ADAPTERS: z
    .enum(["true", "false", "1", "0"])
    .optional()
    .transform((v) => v === "true" || v === "1"),
  SUNO_API_KEY: z.string().optional(),
  SUNO_API_BASE: z.string().url().optional(),
  KLING_API_KEY: z.string().optional(),
  KLING_API_BASE: z.string().url().optional(),
  ELEVENLABS_API_KEY: z.string().optional(),
  ELEVENLABS_VOICE_ID: z.string().optional(),
  HEDRA_API_KEY: z.string().optional(),
  HEDRA_API_BASE: z.string().url().optional(),
  CREATOMATE_API_KEY: z.string().optional(),
  CREATOMATE_TEMPLATE_FACELESS: z.string().optional(),
  CREATOMATE_TEMPLATE_SHORTS: z.string().optional(),
  YOUTUBE_CLIENT_ID: z.string().optional(),
  YOUTUBE_CLIENT_SECRET: z.string().optional(),
  YOUTUBE_REFRESH_TOKEN: z.string().optional(),
  DISTROKID_API_KEY: z.string().optional(),
  IDENTIFYY_API_KEY: z.string().optional(),
  REPLICATE_API_TOKEN: z.string().optional(),
  REPLICATE_FACE_MODEL_VERSION: z.string().optional(),
  SEEDANCE_API_KEY: z.string().optional(),
  SEEDANCE_API_BASE: z.string().url().optional(),
  UDIO_API_KEY: z.string().optional(),
  UDIO_API_BASE: z.string().url().optional(),
  MUSIC_PROVIDER: z.enum(["suno", "udio"]).optional(),
  SENTRY_DSN: z.string().optional(),
  GIT_SHA: z.string().optional(),
  LOG_LEVEL: z.string().optional(),
  SIGNAL_CSV_PATH: z.string().optional(),
  SONGTRADR_BRIEFS_CSV: z.string().optional(),
  SYNC_BATCH_LIMIT: z.string().optional(),
  WORKER_PORT: z.string().optional(),
  N8N_WEBHOOK_SECRET: z.string().optional(),
  WORKER_API_URL: z.string().url().optional(),
});

export type Env = z.infer<typeof envSchema>;

export function loadEnv(source: NodeJS.ProcessEnv = process.env): Env {
  return envSchema.parse(source);
}

export function getSupabaseUrl(env: Env): string {
  const url = env.SUPABASE_URL ?? env.NEXT_PUBLIC_SUPABASE_URL;
  if (!url) throw new Error("Missing SUPABASE_URL or NEXT_PUBLIC_SUPABASE_URL");
  return url;
}

export function shouldUseStubAdapters(env: Env = loadEnv()): boolean {
  if (env.USE_STUB_ADAPTERS === true) return true;
  if (env.USE_STUB_ADAPTERS === false) return false;
  return !env.SUNO_API_KEY && !env.KLING_API_KEY;
}

export function isInfraConfigured(env: Env = loadEnv()): {
  supabase: boolean;
  r2: boolean;
  redis: boolean;
} {
  return {
    supabase: Boolean(
      (env.SUPABASE_URL ?? env.NEXT_PUBLIC_SUPABASE_URL) &&
        env.SUPABASE_SERVICE_ROLE_KEY
    ),
    r2: Boolean(
      env.R2_ACCOUNT_ID && env.R2_ACCESS_KEY_ID && env.R2_SECRET_ACCESS_KEY
    ),
    redis: Boolean(env.REDIS_URL),
  };
}
