import { NextResponse } from "next/server";
import { sessionAuthority, HttpError } from "@/lib/security/auth";
import { apiError } from "@/lib/security/http";
import { audit } from "@/lib/room/audit";
import { rateLimit } from "@/lib/security/rate-limit";
export const runtime = "nodejs";
export async function POST(
  _: Request,
  { params }: { params: Promise<{ sessionId: string }> },
) {
  try {
    const { sessionId } = await params;
    const { user, session, admin } = await sessionAuthority(sessionId, [
      "host",
    ]);
    await rateLimit("session-control", user.id, 20, 60);
    if (session.status !== "live")
      throw new HttpError(409, "The session is not live.");
    const endsAt = new Date(Date.now() + 60_000).toISOString();
    const { error } = await admin
      .from("sessions")
      .update({ ends_at: endsAt })
      .eq("id", sessionId)
      .eq("status", "live");
    if (error) throw error;
    await audit(admin, {
      actor_user_id: user.id,
      room_id: session.room_id,
      session_id: sessionId,
      target_user_id: null,
      action: "session_ending",
      metadata: { ends_at: endsAt },
      created_at: new Date().toISOString(),
    });
    return NextResponse.json({ endsAt });
  } catch (error) {
    return apiError(error, "session_end_failed");
  }
}
