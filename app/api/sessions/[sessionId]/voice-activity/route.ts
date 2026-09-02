import { NextResponse } from "next/server";
import { sessionAuthority, HttpError } from "@/lib/security/auth";
import { apiError } from "@/lib/security/http";
import { rateLimit } from "@/lib/security/rate-limit";

export const runtime = "nodejs";

type VoiceActivityRpc = (
  fn: string,
  args: Record<string, unknown>,
) => Promise<{
  data: string | null;
  error: { message: string; code?: string } | null;
}>;

export async function POST(
  _: Request,
  { params }: { params: Promise<{ sessionId: string }> },
) {
  try {
    const { sessionId } = await params;
    const { user, session, admin } = await sessionAuthority(sessionId);
    await rateLimit("voice-activity", user.id, 12, 60, admin);

    if (session.status !== "live")
      throw new HttpError(409, "The session is not live.");

    const rpc = admin.rpc.bind(admin) as unknown as VoiceActivityRpc;
    const { data, error } = await rpc("record_session_voice_activity", {
      p_session_id: sessionId,
    });
    if (error) throw error;
    if (!data) throw new HttpError(409, "The session is no longer live.");

    return NextResponse.json({ ok: true, recordedAt: data });
  } catch (error) {
    return apiError(error, "voice_activity_failed");
  }
}
