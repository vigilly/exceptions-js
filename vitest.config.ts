import { defineConfig } from "vitest/config";
import { resolve } from "node:path";

// Resolve the in-repo @vigilly/core package straight from source so tests run
// without a prior build step.
export default defineConfig({
  resolve: {
    alias: {
      "@vigilly/core": resolve(__dirname, "packages/core/src/index.ts"),
    },
  },
  test: {
    // Each test file declares its own environment via `// @vitest-environment`.
    environment: "node",
    include: ["packages/**/src/**/*.test.ts"],
  },
});
