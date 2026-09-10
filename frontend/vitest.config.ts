import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";
import { fileURLToPath } from "node:url";

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      "@": fileURLToPath(new URL(".", import.meta.url)),

      // Two suites exercise backend logic directly — the validation schemas and
      // the mock media adapter. Not present in vite.config.ts, because the app
      // bundle imports nothing from backend/ except types, which are erased.
      "@backend": fileURLToPath(new URL("../backend", import.meta.url)),

      // Backend files use fully-qualified npm: specifiers so Supabase can
      // bundle them without an import map. Node has no idea what "npm:" means,
      // so map it to the copy installed here for the two suites that import
      // backend logic.
      "npm:zod@4.5.4": fileURLToPath(new URL("./node_modules/zod", import.meta.url)),
    },
  },
  test: {
    environment: "jsdom",
    setupFiles: ["./tests/setup.ts"],
    include: ["tests/**/*.test.{ts,tsx}"],
  },
});
