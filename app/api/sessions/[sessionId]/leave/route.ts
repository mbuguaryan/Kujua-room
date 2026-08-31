import { NextResponse } from "next/server";
import { sessionAuthority } from "@/lib/security/auth";
import { apiError } from "@/lib/security/http";
export const runtime = "nodejs";
export async function POST(
  _: Request,
  { params }: { params: Promise<{ sessionId: string }> },
) {
  try {
    const { sessionId } = await params;
    const { user, admin } = await sessionAuthority(sessionId);
    const now = new Date().toISOString();
    await admin
      .from("session_participants")
      .update({ left_at: now, last_seen_at: now })
      .eq("session_id", sessionId)
      .eq("user_id", user.id);
    return NextResponse.json({ ok: true });
  } catch (error) {
    return apiError(error, "session_leave_failed");
  }
}
