import { NextResponse } from "next/server";
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  ReviewDecisionSchema,
  ReviewItemIdSchema,
  WestboundRepository,
  type ReviewDecision,
} from "@westbound/platform";

/**
 * Platform repository (FSM-checked stage helpers) over the dashboard's
 * service-role client. The dashboard pins a newer @supabase/supabase-js than
 * @westbound/platform, so the two SupabaseClient class types are nominally
 * different; the runtime query-builder API used by the repository is the same.
 */
export function reviewRepository(db: SupabaseClient): WestboundRepository {
  return new WestboundRepository(
    db as unknown as ConstructorParameters<typeof WestboundRepository>[0]
  );
}

export function reviewError(status: number, error: string, extra: Record<string, unknown> = {}) {
  return NextResponse.json({ error, ...extra }, { status });
}

/** zod-validated approve/reject body, or a 400 response. */
export async function parseReviewDecision(
  req: Request
): Promise<{ ok: true; body: ReviewDecision } | { ok: false; response: NextResponse }> {
  let raw: unknown;
  try {
    raw = await req.json();
  } catch {
    return { ok: false, response: reviewError(400, "Request body must be JSON") };
  }
  const parsed = ReviewDecisionSchema.safeParse(raw);
  if (!parsed.success) {
    return {
      ok: false,
      response: reviewError(400, "Invalid review decision", {
        issues: parsed.error.issues.map((i) => ({ path: i.path.join("."), message: i.message })),
      }),
    };
  }
  return { ok: true, body: parsed.data };
}

/** Database-backed items are UUIDs; anything else cannot exist (400, not a DB error). */
export function invalidItemId(itemId: string): NextResponse | null {
  return ReviewItemIdSchema.safeParse(itemId).success
    ? null
    : reviewError(400, "itemId must be a UUID");
}

export function databaseError(context: string, err: unknown): NextResponse {
  console.error(`[review] ${context}`, err);
  return reviewError(500, `Database error while ${context}`);
}

/** POST a job to the worker. Returns true only for a 2xx response. */
export async function enqueueWorkerJob(job: Record<string, unknown>): Promise<boolean> {
  const workerUrl = process.env.WORKER_API_URL ?? "http://localhost:3001";
  const secret = process.env.N8N_WEBHOOK_SECRET;
  try {
    const res = await fetch(`${workerUrl}/api/jobs/enqueue`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(secret ? { "x-n8n-secret": secret } : {}),
      },
      body: JSON.stringify(job),
      signal: AbortSignal.timeout(10_000),
    });
    return res.ok;
  } catch {
    return false;
  }
}
