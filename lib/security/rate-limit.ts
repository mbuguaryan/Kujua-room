import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";
import { HttpError } from "./auth";
import { createHash } from "node:crypto";
export async function rateLimit(
  scope: string,
  subject: string,
  limit: number,
  windowSeconds: number,
) {
  const key = createHash("sha256").update(subject).digest("hex");
  const { data, error } = await createAdminClient()
    .schema("private")
    .rpc("consume_rate_limit", {
      p_rate_key: key,
      p_bucket: scope,
      p_limit: limit,
      p_window_seconds: windowSeconds,
    });
  if (error) throw new Error(`Rate limit unavailable: ${error.message}`);
  if (data === false)
    throw new HttpError(429, "Too many attempts. Please try again later.");
}
