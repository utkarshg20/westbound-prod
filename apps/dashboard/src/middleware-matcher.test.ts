import { readdirSync } from "node:fs";
import { join, relative, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { unstable_doesMiddlewareMatch } from "next/experimental/testing/server";
import { config } from "./middleware";

// middleware.test.ts calls the middleware directly; this checks which requests
// Next.js sends to it. Kept in its own file: Next's helper loads server internals
// that patch Error inspection, which breaks SDK error logging in those tests.
const appDir = fileURLToPath(new URL("./app/", import.meta.url));
function appPaths(file: "page.tsx" | "route.ts", dir = appDir): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    if (entry.isDirectory()) return appPaths(file, join(dir, entry.name));
    return entry.name === file ? [`/${relative(appDir, dir).split(sep).join("/")}`] : [];
  });
}
const matches = (path: string) => unstable_doesMiddlewareMatch({ config, url: `https://studio.example.test${path}` });
const routes = appPaths("route.ts");
const gated = routes.filter((path) => path.startsWith("/api/") && !path.startsWith("/api/auth/"));
const outside = [...routes.filter((path) => !gated.includes(path)), ...appPaths("page.tsx")];

describe("middleware matcher", () => {
  it("runs the session gate for every API route outside /api/auth/*", () => {
    expect(gated).toEqual(expect.arrayContaining(["/api/ops/dlq-retry", "/api/ops/royalty-import", "/api/refs/upload", "/api/review/approve"]));
    expect(gated.filter((path) => !matches(path))).toEqual([]);
  });

  it("never runs for /api/auth/*, /auth/confirm or pages", () => {
    expect(outside).toEqual(expect.arrayContaining(["/api/auth/magic-link", "/api/auth/logout", "/auth/confirm", "/", "/ops", "/review", "/login"]));
    expect(outside.filter(matches)).toEqual([]);
  });
});
