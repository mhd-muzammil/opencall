import { defineConfig } from "vitest/config";

// Unit tests live in src/**; the tests/ directory holds Playwright e2e specs
// (run via `pnpm test:e2e`) that must not be collected by vitest — importing
// @playwright/test inside a vitest worker throws at collection time.
export default defineConfig({
  test: {
    include: ["src/**/*.test.{ts,tsx}"],
  },
});
