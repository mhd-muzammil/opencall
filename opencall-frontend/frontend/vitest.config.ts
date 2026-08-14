import { defineConfig } from "vitest/config";

// Unit tests live in src/**; the tests/ directory holds Playwright e2e specs
// (run via `pnpm test:e2e`) that must not be collected by vitest — importing
// @playwright/test inside a vitest worker throws at collection time.
export default defineConfig({
  // tsconfig says jsx: "preserve" because Next does the transform in the app
  // build. vitest has no Next in front of it, so esbuild must be told which
  // runtime to use — the automatic one, same as Next, or a component with JSX in
  // it fails at render with "React is not defined".
  esbuild: { jsx: "automatic" },
  test: {
    include: ["src/**/*.test.{ts,tsx}"],
  },
});
