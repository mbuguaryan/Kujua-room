import { NextResponse } from "next/server";
import { sessionAuthority, HttpError } from "@/lib/security/auth";
import { apiError } from "@/lib/security/http";
import { audit } from "@/lib/room/audit";
export const runtime = "nodejs";
export async function POST(
  _: Request,
  { params }: { params: Promise<{ sessionId: string }> },
) {
  try {
    const { sessionId } = await params;
    const { user, session, admin } = await sessionAuthority(sessionId);
    if (!session.ends_at || new Date(session.ends_at).getTime() > Date.now())
      throw new HttpError(409, "The ending countdown is still active.");
    const now = new Date().toISOString();
    await admin
      .from("sessions")
      .update({ status: "ended", ended_at: now })
      .eq("id", sessionId)
      .eq("status", "live");
    await admin
      .from("session_participants")
      .update({ left_at: now, last_seen_at: now })
      .eq("session_id", sessionId)
      .is("left_at", null);
    await audit(admin, {
      actor_user_id: user.id,
      target_user_id: null,
      room_id: session.room_id,
      session_id: sessionId,
      action: "session_ended",
      metadata: {},
      created_at: now,
    });
    return NextResponse.json({ ok: true });
  } catch (error) {
    return apiError(error, "session_finalize_failed");
  }
}
