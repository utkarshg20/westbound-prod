import { afterEach, describe, expect, it, vi } from "vitest";
import { forwardSessionHeaders } from "../middleware";
import { reviewerAllowed } from "./reviewer";

const req = (email?: string) => new Request("https://x.test/api", { method: "POST", headers: email ? { "x-session-email": email } : {} });

afterEach(() => vi.unstubAllEnvs());

describe("reviewerAllowed", () => {
  it("lets only the configured reviewer decide hero_publish runs", () => {
    vi.stubEnv("REVIEWER_EMAIL", "dan@example.test");
    expect(reviewerAllowed(req("dan@example.test"), "hero_publish")).toBe(true);
    expect(reviewerAllowed(req("other@example.test"), "hero_publish")).toBe(false);
    expect(reviewerAllowed(req(), "hero_publish")).toBe(false);
  });

  it("does not restrict other queues", () => {
    vi.stubEnv("REVIEWER_EMAIL", "dan@example.test");
    expect(reviewerAllowed(req("other@example.test"), "sync")).toBe(true);
  });

  it("with no reviewer configured the review flow keeps working (and says it is open), in production too", () => {
    const err = vi.spyOn(console, "error").mockImplementation(() => undefined);
    vi.stubEnv("REVIEWER_EMAIL", "");
    vi.stubEnv("NODE_ENV", "production");
    expect(reviewerAllowed(req("anyone@example.test"), "hero_publish")).toBe(true);
    expect(err).toHaveBeenCalledWith(expect.stringContaining("REVIEWER_EMAIL is not set"));
    err.mockRestore();
  });

  it("REQUIRE_REVIEWER_EMAIL makes an unset reviewer mean nobody can decide", () => {
    vi.stubEnv("REVIEWER_EMAIL", "");
    vi.stubEnv("REQUIRE_REVIEWER_EMAIL", "true");
    expect(reviewerAllowed(req("anyone@example.test"), "hero_publish")).toBe(false);
  });
});

describe("forwardSessionHeaders", () => {
  it("replaces a client-supplied x-session-email with the verified one", () => {
    const h = forwardSessionHeaders(new Headers({ "x-session-email": "dan@example.test", cookie: "a=b" }), "operator@example.test");
    expect(h.get("x-session-email")).toBe("operator@example.test");
    expect(h.get("cookie")).toBe("a=b");
  });

  it("strips a spoofed x-session-email when the session has no email (anonymous or phone sign-in)", () => {
    for (const email of [null, undefined, ""]) {
      const h = forwardSessionHeaders(new Headers({ "x-session-email": "dan@example.test" }), email);
      expect(h.has("x-session-email")).toBe(false);
    }
  });
});
