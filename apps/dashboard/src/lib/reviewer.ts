/**
 * Who may approve, reject or attach a master to a hero_publish run.
 *
 * REVIEWER_EMAIL names the one reviewer, and when it is set only that signed-in user can decide. If it is unset,
 * hero_publish decisions are open to every signed-in project user, as they always were: tightening this must not stop
 * the review flow on the deploy that ships it, so an unset value keeps working and logs that it is open. Set it to
 * close the gate; REQUIRE_REVIEWER_EMAIL=true makes an unset value mean "nobody can decide" instead (production).
 */
export function reviewerConfigured(): boolean {
  return Boolean(process.env.REVIEWER_EMAIL);
}

export function reviewerAllowed(req: Request, queue: string): boolean {
  if (queue !== "hero_publish") return true;
  const reviewerEmail = process.env.REVIEWER_EMAIL;
  if (!reviewerEmail) {
    if (process.env.REQUIRE_REVIEWER_EMAIL === "true") return false;
    console.error("REVIEWER_EMAIL is not set: every signed-in user can decide hero_publish runs. Set it to restrict to one reviewer.");
    return true;
  }
  const callerEmail = new Headers(req.headers).get("x-session-email");
  return Boolean(callerEmail) && callerEmail === reviewerEmail;
}

export const REVIEWER_DENIED = "only the designated reviewer can decide hero_publish runs (REVIEWER_EMAIL)";
