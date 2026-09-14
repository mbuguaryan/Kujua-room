import { z } from "npm:zod@4.5.4";

const schema = z.object({
  SUPABASE_URL: z.string().url(),
  SUPABASE_PUBLISHABLE_KEY: z.string().min(20),
  SUPABASE_SERVICE_ROLE_KEY: z.string().min(20).optional(),
  CLOUDFLARE_ACCOUNT_ID: z.string().min(1).optional(),
  CLOUDFLARE_REALTIMEKIT_APP_ID: z.string().min(1).optional(),
  CLOUDFLARE_API_TOKEN: z.string().min(1).optional(),
  CLOUDFLARE_RTK_HOST_PRESET: z.string().default("host"),
  CLOUDFLARE_RTK_MODERATOR_PRESET: z.string().default("moderator"),
  CLOUDFLARE_RTK_SPEAKER_PRESET: z.string().default("speaker"),
  CLOUDFLARE_RTK_AUDIENCE_PRESET: z.string().default("audience"),
  MEDIA_ADAPTER: z.enum(["realtimekit", "mock"]).default("realtimekit"),
});

/**
 * Server environment. Replaces lib/env.server.ts — the `server-only` import
 * that guarded it under Next has no meaning in Deno, but the guarantee is
 * stronger here: this file is only ever bundled into Edge Functions, and Vite
 * refuses to expose anything without a VITE_ prefix to the browser.
 */
export const serverEnv = () =>
  schema.parse({
    SUPABASE_URL: Deno.env.get("SUPABASE_URL"),
    SUPABASE_PUBLISHABLE_KEY:
      Deno.env.get("SUPABASE_PUBLISHABLE_KEY") ?? Deno.env.get("SUPABASE_ANON_KEY"),
    SUPABASE_SERVICE_ROLE_KEY: Deno.env.get("SUPABASE_SERVICE_ROLE_KEY"),
    CLOUDFLARE_ACCOUNT_ID: Deno.env.get("CLOUDFLARE_ACCOUNT_ID"),
    CLOUDFLARE_REALTIMEKIT_APP_ID: Deno.env.get("CLOUDFLARE_REALTIMEKIT_APP_ID"),
    CLOUDFLARE_API_TOKEN: Deno.env.get("CLOUDFLARE_API_TOKEN"),
    CLOUDFLARE_RTK_HOST_PRESET: Deno.env.get("CLOUDFLARE_RTK_HOST_PRESET"),
    CLOUDFLARE_RTK_MODERATOR_PRESET: Deno.env.get("CLOUDFLARE_RTK_MODERATOR_PRESET"),
    CLOUDFLARE_RTK_SPEAKER_PRESET: Deno.env.get("CLOUDFLARE_RTK_SPEAKER_PRESET"),
    CLOUDFLARE_RTK_AUDIENCE_PRESET: Deno.env.get("CLOUDFLARE_RTK_AUDIENCE_PRESET"),
    MEDIA_ADAPTER: Deno.env.get("MEDIA_ADAPTER"),
  });
