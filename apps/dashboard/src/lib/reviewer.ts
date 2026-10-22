/**
 * Who may approve, reject or attach a master to a hero_publish run.
 *
 * REVIEWER_EMAIL names the one reviewer. If it is unset, hero_publish decisions used to be open to every signed-in
 * project user, which is a fail-open default on the gate that releases things to the public. Outside production
 * (local development, tests) an unset value still means "no restriction"; in production it means nobody can decide
 * until it is configured.
 */
export function reviewerConfigured(): boolean {
  return Boolean(process.env.REVIEWER_EMAIL);
}

export function reviewerAllowed(req: Request, queue: string): boolean {
  if (queue !== "hero_publish") return true;
  const reviewerEmail = process.env.REVIEWER_EMAIL;
  if (!reviewerEmail) return process.env.NODE_ENV !== "production";
  const callerEmail = new Headers(req.headers).get("x-session-email");
  return Boolean(callerEmail) && callerEmail === reviewerEmail;
}

export const REVIEWER_DENIED = "only the designated reviewer can decide hero_publish runs (and REVIEWER_EMAIL must be set in production)";
