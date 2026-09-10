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

      // Those backend files resolve their own dependencies through Deno's
      // import map at runtime. Node resolution walks up from backend/ and never
      // reaches frontend/node_modules, so point zod at the copy installed here.
      zod: fileURLToPath(new URL("./node_modules/zod", import.meta.url)),
    },
  },
  test: {
    environment: "jsdom",
    setupFiles: ["./tests/setup.ts"],
    include: ["tests/**/*.test.{ts,tsx}"],
  },
});
