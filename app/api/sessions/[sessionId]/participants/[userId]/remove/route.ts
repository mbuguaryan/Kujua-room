import { NextResponse } from "next/server";
import { sessionAuthority } from "@/lib/security/auth";
import { apiError } from "@/lib/security/http";
import { mediaAdapter } from "@/lib/media";
import { audit } from "@/lib/room/audit";
import { rateLimit } from "@/lib/security/rate-limit";
export const runtime = "nodejs";
export async function POST(
  request: Request,
  { params }: { params: Promise<{ sessionId: string; userId: string }> },
) {
  try {
    const { sessionId, userId } = await params;
    const body = (await request.json().catch(() => ({}))) as {
      block?: boolean;
    };
    const { user, session, admin } = await sessionAuthority(sessionId, [
      "host",
      "moderator",
    ]);
    await rateLimit("moderation", user.id, 60, 60);
    const now = new Date().toISOString();
    const { data: media } = await admin
      .from("media_participants")
      .select("provider_participant_id")
      .eq("session_id", sessionId)
      .eq("user_id", userId)
      .maybeSingle();
    if (media?.provider_participant_id && session.provider_meeting_id)
      await mediaAdapter().removeParticipant({
        meetingId: session.provider_meeting_id,
        participantId: media.provider_participant_id,
      });
    const { error: attendanceError } = await admin
      .from("session_participants")
      .update({ left_at: now, last_seen_at: now })
      .eq("session_id", sessionId)
      .eq("user_id", userId);
    if (attendanceError) throw attendanceError;
    if (body.block) {
      const { error: blockError } = await admin
        .from("room_members")
        .update({ status: "blocked" })
        .eq("room_id", session.room_id)
        .eq("user_id", userId);
      if (blockError) throw blockError;
    }
    const action = body.block ? "member_blocked" : "participant_removed";
    const { error: eventError } = await admin.from("moderation_events").insert({
      actor_user_id: user.id,
      target_user_id: userId,
      session_id: sessionId,
      action,
      metadata: {},
      created_at: now,
    });
    if (eventError) throw eventError;
    await audit(admin, {
      actor_user_id: user.id,
      target_user_id: userId,
      room_id: session.room_id,
      session_id: sessionId,
      action,
      metadata: {},
      created_at: now,
    });
    return NextResponse.json({ ok: true });
  } catch (error) {
    return apiError(error, "participant_remove_failed");
  }
}
