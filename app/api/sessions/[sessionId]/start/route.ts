import { NextResponse } from "next/server";
import { sessionAuthority, HttpError } from "@/lib/security/auth";
import { apiError } from "@/lib/security/http";
import { mediaAdapter } from "@/lib/media";
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
    if (session.status === "live") return NextResponse.json({ session });
    if (!["scheduled"].includes(session.status))
      throw new HttpError(409, "This session cannot be started.");
    const meetingId =
      session.provider_meeting_id ??
      (await mediaAdapter().createMeeting(session.title)).meetingId;
    const now = new Date().toISOString();
    const { data, error } = await admin
      .from("sessions")
      .update({
        status: "live",
        started_at: now,
        media_provider: "cloudflare-realtimekit",
        provider_meeting_id: meetingId,
        media_created_at: session.media_created_at ?? now,
      })
      .eq("id", sessionId)
      .eq("status", "scheduled")
      .select("*")
      .single();
    if (error?.code === "23505")
      throw new HttpError(409, "Another session is already live in this room.");
    if (error) throw error;
    await audit(admin, {
      actor_user_id: user.id,
      room_id: session.room_id,
      session_id: sessionId,
      target_user_id: null,
      action: "session_started",
      metadata: {},
      created_at: now,
    });
    return NextResponse.json({ session: data });
  } catch (error) {
    return apiError(error, "session_start_failed");
  }
}
