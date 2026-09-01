import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/database.types";
import { createAdminClient } from "@/lib/supabase/admin";
import { HttpError } from "./auth";
import { log } from "./log";
import { createHash } from "node:crypto";
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
