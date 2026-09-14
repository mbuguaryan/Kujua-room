import { createClient as createSupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@backend/supabase/functions/_shared/database.types.ts";
import { publicEnv } from "@/lib/env";

let client: ReturnType<typeof createSupabaseClient<Database>> | undefined;

/**
 * Browser Supabase client. Replaces @supabase/ssr's createBrowserClient: the
 * session now lives in localStorage and supabase-js refreshes it itself, since
 * there is no longer a middleware doing that on every request.
 */
export function createClient() {
  const env = publicEnv();
  return (client ??= createSupabaseClient<Database>(
    env.VITE_SUPABASE_URL,
    env.VITE_SUPABASE_PUBLISHABLE_KEY,
    {
      auth: {
        persistSession: true,
        autoRefreshToken: true,
        detectSessionInUrl: false,
        storageKey: "kujua-room-auth",
      },
    },
  ));
}
