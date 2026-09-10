import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import { fileURLToPath } from "node:url";

export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: {
      "@": fileURLToPath(new URL(".", import.meta.url)),
      // Type-only for the app (database.types) plus two test imports. Erased at
      // build time, so the bundle carries no backend code.
      "@backend": fileURLToPath(new URL("../backend", import.meta.url)),
    },
  },
  server: { port: 3000 },
  preview: { port: 3000 },
  build: { outDir: "dist", sourcemap: false },
});
