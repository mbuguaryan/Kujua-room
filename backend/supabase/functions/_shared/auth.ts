import { createAdminClient, createAnonClient } from "./supabase.ts";
import type { RoomRole } from "./types.ts";

export class HttpError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}

/**
 * Identity now arrives as `Authorization: Bearer <access_token>` rather than a
 * cookie refreshed by middleware. Everything downstream of this function is
 * unchanged: authorization is still decided server-side against room_members
 * through the service-role client, never from the caller's own claims.
 */
export async function requireUser(request: Request) {
  const header = request.headers.get("authorization") ?? "";
  const token = header.toLowerCase().startsWith("bearer ")
    ? header.slice(7).trim()
    : "";
  if (!token) throw new HttpError(401, "Authentication required");

  const { data, error } = await createAnonClient().auth.getUser(token);
  if (error || !data.user) throw new HttpError(401, "Authentication required");
  return data.user;
}

export async function requireMembership(
  request: Request,
  roomId: string,
  allowed?: RoomRole[],
) {
  const user = await requireUser(request);
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
  request: Request,
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
  const auth = await requireMembership(request, session.room_id, allowed);
  return { ...auth, session, admin };
}
