import { NextResponse } from "next/server";
import { z } from "zod";
import { sessionAuthority, HttpError } from "@/lib/security/auth";
import { apiError } from "@/lib/security/http";
import { roomSlugSchema, uuidSchema } from "@/lib/validation/schemas";
export const runtime = "nodejs";
const schema = z.object({ roomSlug: roomSlugSchema, sessionId: uuidSchema, clientInstanceId: z.string().uuid() });
export async function POST(request: Request) {
  try {
    const input = schema.parse(await request.json());
    const { user, member, session, admin } = await sessionAuthority(input.sessionId);
    if (session.status !== "live") throw new HttpError(409, "The session is no longer live.");
    const [{ data: room }, { data: participant }, { data: profile }, { data: note }] = await Promise.all([
      admin.from("rooms").select("id,slug,name,capacity,stage_capacity").eq("id", session.room_id).eq("slug", input.roomSlug).single(),
      admin.from("session_participants").select("current_role").eq("session_id", session.id).eq("user_id", user.id).maybeSingle(),
      admin.from("profiles").select("display_name").eq("user_id", user.id).single(),
      admin.from("session_notes").select("title,body,points,updated_at").eq("session_id", session.id).maybeSingle(),
    ]);
    if (!room || !participant) throw new HttpError(403, "This room session cannot be recovered.");
    const { error } = await admin.from("session_participants").update({ client_instance_id: input.clientInstanceId, left_at: null, last_seen_at: new Date().toISOString() }).eq("session_id", session.id).eq("user_id", user.id);
    if (error) throw error;
    return NextResponse.json({ room: { id: room.id, slug: room.slug, name: room.name, capacity: room.capacity, stageCapacity: room.stage_capacity }, session: { id: session.id, title: session.title, status: session.status, endsAt: session.ends_at }, member: { userId: user.id, role: participant.current_role ?? member.role, displayName: profile?.display_name ?? "Participant" }, notes: { title: note?.title ?? session.title, body: note?.body ?? session.agenda ?? "", points: Array.isArray(note?.points) ? note.points : [], updatedAt: note?.updated_at }, recovered: true });
  } catch (error) { return apiError(error, "room_recovery_failed"); }
}
