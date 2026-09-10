import { createClient } from "@supabase/supabase-js";
import type { Database } from "./database.types.ts";
import { serverEnv } from "./env.ts";

/** Service-role client. Bypasses RLS deliberately — see auth.ts. */
export function createAdminClient() {
  const env = serverEnv();
  if (!env.SUPABASE_SERVICE_ROLE_KEY)
    throw new Error("SUPABASE_SERVICE_ROLE_KEY is required");
  return createClient<Database>(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

/** Anon-key client, used only to verify a caller's bearer token and to sign in. */
export function createAnonClient() {
  const env = serverEnv();
  return createClient<Database>(env.SUPABASE_URL, env.SUPABASE_PUBLISHABLE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}
