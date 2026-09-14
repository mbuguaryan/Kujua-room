import { defineConfig, devices } from "@playwright/test";

/**
 * Two processes now, where Next served both halves from one. `vite preview`
 * serves the built SPA; the API lives in Supabase Edge Functions, so
 * `supabase functions serve` has to be running alongside it — start it with
 * `npm run functions:serve` before `npm run test:e2e`, or wire it into CI as a
 * second webServer entry once the Supabase CLI is installed on the runner.
 */
export default defineConfig({
  testDir: "./tests/e2e",
  use: { baseURL: "http://127.0.0.1:3101", trace: "on-first-retry" },
  webServer: {
    command: "npm run build && npm run preview -- --host 127.0.0.1 --port 3101",
    url: "http://127.0.0.1:3101",
    reuseExistingServer: false,
    timeout: 120_000,
  },
  projects: [
    { name: "chromium", use: { ...devices["Desktop Chrome"] } },
    { name: "mobile", use: { ...devices["iPhone 13"] } },
  ],
});
