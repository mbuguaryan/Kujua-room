import { NextResponse } from "next/server";
import { sessionAuthority } from "@/lib/security/auth";
import { apiError } from "@/lib/security/http";
import { audit } from "@/lib/room/audit";
import { rateLimit } from "@/lib/security/rate-limit";
export const runtime = "nodejs";
export async function POST(_: Request, { params }: { params: Promise<{ sessionId: string }> }) {
  try {
    const { sessionId } = await params;
    const { user, session, admin } = await sessionAuthority(sessionId, ["host", "moderator"]);
    await rateLimit("moderation", user.id, 60, 60);
    const now = new Date().toISOString();
    await admin.from("moderation_events").insert({ actor_user_id: user.id, target_user_id: null, session_id: sessionId, action: "mute", metadata: { scope: "all", allow_self_unmute: true }, created_at: now });
    await audit(admin, { actor_user_id: user.id, target_user_id: null, room_id: session.room_id, session_id: sessionId, action: "participants_mute_all_requested", metadata: { allow_self_unmute: true }, created_at: now });
    return NextResponse.json({ ok: true, providerAction: "client_mute_all", allowSelfUnmute: true });
  } catch (error) { return apiError(error, "participants_mute_all_failed"); }
}
