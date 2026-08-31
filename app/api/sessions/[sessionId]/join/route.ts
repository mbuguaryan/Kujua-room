import { NextResponse } from "next/server";
import { sessionAuthority, HttpError } from "@/lib/security/auth";
import { apiError } from "@/lib/security/http";
export const runtime = "nodejs";
export async function POST(
  _: Request,
  { params }: { params: Promise<{ sessionId: string }> },
) {
  try {
    const { sessionId } = await params;
    const { user, member, session, admin } = await sessionAuthority(sessionId);
    if (session.status !== "live")
      throw new HttpError(409, "The session is not live.");
    const now = new Date().toISOString();
    const { data: profile } = await admin
      .from("profiles")
      .select("display_name")
      .eq("user_id", user.id)
      .single();
    const { data: existing } = await admin
      .from("session_participants")
      .select("id,current_role")
      .eq("session_id", sessionId)
      .eq("user_id", user.id)
      .maybeSingle();
    if (existing) {
      await admin
        .from("session_participants")
        .update({
          left_at: null,
          last_seen_at: now,
          display_name: profile?.display_name ?? "Participant",
        })
        .eq("id", existing.id);
    } else {
      await admin.from("session_participants").insert({
        session_id: sessionId,
        room_id: session.room_id,
        user_id: user.id,
        display_name: profile?.display_name ?? "Participant",
        role_snapshot: member.role,
        current_role: member.role,
        joined_at: now,
        left_at: null,
        last_seen_at: now,
      });
    }
    return NextResponse.json({
      ok: true,
      role: existing?.current_role ?? member.role,
    });
  } catch (error) {
    return apiError(error, "session_join_failed");
  }
}
