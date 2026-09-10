import { createHash } from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/database.types.ts";
import { createAdminClient } from "./supabase.ts";
import { HttpError } from "./auth.ts";
import { log } from "./log.ts";

/**
 * Unchanged from lib/security/rate-limit.ts: the limiter itself is a Postgres
 * RPC, so it moves runtimes without moving behaviour. node:crypto resolves
 * under Deno via the node: specifier — this hashing is security-critical
 * (it is also how invite tokens are hashed), so it is worth verifying first
 * when porting.
 */
export async function rateLimit(
  scope: string,
  subject: string,
  limit: number,
  windowSeconds: number,
  admin: SupabaseClient<Database> = createAdminClient(),
) {
  const key = createHash("sha256").update(subject).digest("hex");
  const { data, error } = await admin.rpc("consume_rate_limit_server", {
    p_rate_key: key,
    p_bucket: scope,
    p_limit: limit,
    p_window_seconds: windowSeconds,
  });
  if (error) {
    log("error", "rate_limit_unavailable", {
      scope,
      code: error.code || "unknown",
    });
    throw new HttpError(503, "Rate limiting is temporarily unavailable.");
  }
  if (data === false) {
    log("warn", "rate_limit_exceeded", { scope });
    throw new HttpError(429, "Too many attempts. Please try again later.");
  }
}

/** Client IP for limits that must bite before any user identity exists. */
export function clientIp(request: Request) {
  return (
    request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "unknown"
  );
}
