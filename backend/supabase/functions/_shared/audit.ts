import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "./database.types.ts";

type AuditInsert = Database["public"]["Tables"]["audit_log"]["Insert"] & {
  target_user_id?: string | null;
};

export async function audit(
  admin: SupabaseClient<Database>,
  entry: AuditInsert,
) {
  const { target_user_id, ...row } = entry;
  const metadata = {
    ...(typeof row.metadata === "object" &&
    row.metadata &&
    !Array.isArray(row.metadata)
      ? row.metadata
      : {}),
    ...(target_user_id ? { target_user_id } : {}),
  };
  const { error } = await admin.from("audit_log").insert({ ...row, metadata });
  if (error) throw error;
}
