import { z } from "zod";

const publicSchema = z.object({
  VITE_SUPABASE_URL: z.string().url(),
  VITE_SUPABASE_PUBLISHABLE_KEY: z.string().min(20),
  VITE_API_BASE_URL: z.string().url(),
});

/**
 * Browser environment. Vite inlines import.meta.env at build time and exposes
 * only VITE_-prefixed values, which is what keeps the service-role key and the
 * Cloudflare API token out of the bundle: client code cannot see them at all.
 * scripts/check-bundle-secrets.mjs asserts that on every build.
 */
export const publicEnv = () =>
  publicSchema.parse({
    VITE_SUPABASE_URL: import.meta.env.VITE_SUPABASE_URL,
    VITE_SUPABASE_PUBLISHABLE_KEY: import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY,
    VITE_API_BASE_URL: import.meta.env.VITE_API_BASE_URL,
  });
