import "server-only";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import type { RoomRole } from "@/types/room";

export class HttpError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}
export async function requireUser() {
  const supabase = await createClient();
  const { data, error } = await supabase.auth.getUser();
  if (error || !data.user) throw new HttpError(401, "Authentication required");
  return data.user;
}
export async function requireMembership(roomId: string, allowed?: RoomRole[]) {
  const user = await requireUser();
  const admin = createAdminClient();
  const { data, error } = await admin
    .from("room_members")
    .select("room_id,user_id,role,status")
    .eq("room_id", roomId)
    .eq("user_id", user.id)
    .maybeSingle();
  if (error || !data || data.status !== "active")
    throw new HttpError(403, "Room access denied");
  if (allowed && !allowed.includes(data.role))
    throw new HttpError(403, "This action is not permitted");
  return { user, member: data };
}
export async function sessionAuthority(
  sessionId: string,
  allowed?: RoomRole[],
) {
  const admin = createAdminClient();
  const { data: session, error } = await admin
    .from("sessions")
    .select("*")
    .eq("id", sessionId)
    .maybeSingle();
  if (error || !session) throw new HttpError(404, "Session not found");
  const auth = await requireMembership(session.room_id, allowed);
  return { ...auth, session, admin };
}
