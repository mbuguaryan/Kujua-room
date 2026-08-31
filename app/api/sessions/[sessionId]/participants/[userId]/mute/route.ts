import { NextResponse } from "next/server";
import { sessionAuthority } from "@/lib/security/auth";
import { apiError } from "@/lib/security/http";
import { audit } from "@/lib/room/audit";
import { rateLimit } from "@/lib/security/rate-limit";
export const runtime = "nodejs";
export async function POST(
  _: Request,
  { params }: { params: Promise<{ sessionId: string; userId: string }> },
) {
  try {
    const { sessionId, userId } = await params;
    const { user, session, admin } = await sessionAuthority(sessionId, [
      "host",
      "moderator",
    ]);
    await rateLimit("moderation", user.id, 60, 60);
    await audit(admin, {
      actor_user_id: user.id,
      target_user_id: userId,
      room_id: session.room_id,
      session_id: sessionId,
      action: "participant_mute_requested",
      metadata: {},
      created_at: new Date().toISOString(),
    });
    return NextResponse.json(
      { ok: true, providerAction: "client_mute_event_required" },
      { status: 202 },
    );
  } catch (error) {
    return apiError(error, "participant_mute_failed");
  }
}
