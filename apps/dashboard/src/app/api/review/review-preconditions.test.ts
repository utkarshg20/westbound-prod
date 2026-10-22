import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

// Source-level checks for conditions that need a database to exercise end to end (the route tests use an in-memory
// PostgREST double for runs only). These pin the preconditions so they cannot be dropped silently.
const read = (p: string) => readFileSync(fileURLToPath(new URL(p, import.meta.url)), "utf8");

describe("approve and reject preconditions", () => {
  it("outreach approve and reject only act on drafts pending review", () => {
    for (const f of ["./approve/route.ts", "./reject/route.ts"]) {
      const src = read(f);
      expect(src).toContain('.eq("status", "pending_dan_review")');
      expect(src).toContain("only drafts pending review can be");
    }
  });
  it("sync approve refuses a track that is already approved or uploaded", () => {
    const src = read("./approve/route.ts");
    expect(src).toContain('meta.uploaded === true || meta.qaStatus === "approved"');
  });
  it("the upload job skips a track already uploaded", () => {
    const src = readFileSync(fileURLToPath(new URL("../../../../../../packages/sync-engine/src/pipeline.ts", import.meta.url)), "utf8");
    expect(src).toContain("track.metadata.uploaded === true");
  });
  it("refs/upload turns an R2 failure into a 503 in production", () => {
    const src = read("../refs/upload/route.ts");
    expect(src).toContain('process.env.NODE_ENV === "production"');
    expect(src).toContain("status: 503");
  });
});
