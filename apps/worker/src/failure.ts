/**
 * BullMQ emits `failed` after EVERY failed attempt, including ones it will retry. Writing a dead-letter row on each
 * left up to three rows per failing job (and a row for a job that then succeeded), and retrying a row re-runs work that
 * had finished or was still in flight. Only the last attempt is a dead letter.
 */
export function isFinalFailure(job: { attemptsMade?: number; opts?: { attempts?: number } } | undefined | null): boolean {
  if (!job) return false;
  const allowed = job.opts?.attempts ?? 1;
  return (job.attemptsMade ?? 0) >= allowed;
}
