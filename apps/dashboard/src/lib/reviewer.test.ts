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

  it("fails closed in production when no reviewer is configured, and stays open only outside production", () => {
    vi.stubEnv("REVIEWER_EMAIL", "");
    vi.stubEnv("NODE_ENV", "production");
    expect(reviewerAllowed(req("anyone@example.test"), "hero_publish")).toBe(false);
    vi.stubEnv("NODE_ENV", "development");
    expect(reviewerAllowed(req("anyone@example.test"), "hero_publish")).toBe(true);
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
