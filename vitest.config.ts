import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: {
    // Mirror apps/dashboard/tsconfig.json `paths` so route handlers using
    // `@/lib/...` can be imported directly by dashboard tests.
    alias: [
      {
        find: /^@\/(.*)$/,
        replacement: fileURLToPath(new URL("./apps/dashboard/src/$1", import.meta.url)),
      },
    ],
  },
  test: {
    globals: false,
    environment: "node",
    include: [
      "packages/**/*.test.ts",
      "apps/dashboard/src/**/*.test.ts",
    ],
  },
});
