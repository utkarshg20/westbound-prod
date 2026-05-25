#!/usr/bin/env npx tsx
/**
 * Verify local / deployed infrastructure connectivity.
 * Usage: npx tsx scripts/check-health.ts
 */
import { loadEnv, isInfraConfigured, shouldUseStubAdapters } from "../packages/platform/src/config.js";
import { createClient } from "@supabase/supabase-js";
import Redis from "ioredis";

async function main() {
  const env = loadEnv();
  const infra = isInfraConfigured(env);
  const results: Record<string, string> = {
    adapters: shouldUseStubAdapters(env) ? "stub" : "live",
  };

  if (infra.supabase) {
    try {
      const url = env.SUPABASE_URL ?? env.NEXT_PUBLIC_SUPABASE_URL!;
      const db = createClient(url, env.SUPABASE_SERVICE_ROLE_KEY!, {
        auth: { persistSession: false },
      });
      const { error } = await db.from("projects").select("slug").limit(1);
      results.supabase = error ? `error: ${error.message}` : "ok";
    } catch (e) {
      results.supabase = `error: ${e}`;
    }
  } else {
    results.supabase = "not configured";
  }

  if (infra.redis) {
    const redis = new Redis(env.REDIS_URL, {
      maxRetriesPerRequest: 1,
      connectTimeout: 3000,
    });
    try {
      await redis.ping();
      results.redis = "ok";
    } catch (e) {
      results.redis = `error: ${e}`;
    } finally {
      redis.disconnect();
    }
  } else {
    results.redis = "not configured";
  }

  results.r2 = infra.r2 ? "configured" : "not configured";

  const workerUrl = env.WORKER_API_URL ?? "http://localhost:3001";
  try {
    const res = await fetch(`${workerUrl}/health`, { signal: AbortSignal.timeout(3000) });
    results.worker = res.ok ? "ok" : `http ${res.status}`;
  } catch {
    results.worker = "not reachable (start with pnpm worker)";
  }

  console.log(JSON.stringify({ infra, results }, null, 2));
  const failed = Object.values(results).some((v) => v.startsWith("error"));
  process.exit(failed ? 1 : 0);
}

main();
