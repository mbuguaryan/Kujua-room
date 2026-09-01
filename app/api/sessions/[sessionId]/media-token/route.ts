import { NextResponse } from "next/server";
import { sessionAuthority, HttpError } from "@/lib/security/auth";
import { apiError } from "@/lib/security/http";
import { mediaAdapter } from "@/lib/media";
import { rateLimit } from "@/lib/security/rate-limit";
export const runtime = "nodejs";
export async function POST(
  _: Request,
  { params }: { params: Promise<{ sessionId: string }> },
) {
  try {
    const { sessionId } = await params;
    const { user, member, session, admin } = await sessionAuthority(sessionId);
    if (session.status !== "live" || !session.provider_meeting_id)
      throw new HttpError(409, "The session is not live.");
    await rateLimit(
      "media-token",
      `${user.id}:${sessionId}`,
      10,
      60,
      admin,
    );
    const { data: attendance } = await admin
      .from("session_participants")
      .select("current_role")
      .eq("session_id", sessionId)
      .eq("user_id", user.id)
      .maybeSingle();
    const role = attendance?.current_role ?? member.role;
    // Keep the application role as audience, but issue an audio-capable media
    // preset so every participant can mute/unmute themselves like Google Meet.
    const mediaRole = role === "audience" ? "speaker" : role;
    const { data: profile } = await admin
      .from("profiles")
      .select("display_name")
      .eq("user_id", user.id)
      .single();
    const token = await mediaAdapter().addParticipant({
      meetingId: session.provider_meeting_id,
      userId: user.id,
      name: profile?.display_name ?? "Participant",
      role: mediaRole,
    });
    await admin.from("media_participants").upsert(
      {
        session_id: sessionId,
        user_id: user.id,
        provider_participant_id: token.participantId,
        provider_preset_name: token.presetName,
        provider_meeting_id: session.provider_meeting_id,
        provider: "cloudflare-realtimekit",
        joined_at: new Date().toISOString(),
        left_at: null,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "session_id,user_id" },
    );
    return NextResponse.json(token);
  } catch (error) {
    return apiError(error, "media_token_failed");
  }
}
