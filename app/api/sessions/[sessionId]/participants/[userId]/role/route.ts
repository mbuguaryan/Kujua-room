import { NextResponse } from "next/server";
import { sessionAuthority, HttpError } from "@/lib/security/auth";
import { apiError } from "@/lib/security/http";
import { roleChangeSchema } from "@/lib/validation/schemas";
import { changeSessionRole } from "@/lib/room/moderation";
import { rateLimit } from "@/lib/security/rate-limit";
export const runtime = "nodejs";
export async function PUT(
  request: Request,
  { params }: { params: Promise<{ sessionId: string; userId: string }> },
) {
  try {
    const { sessionId, userId } = await params;
    const input = roleChangeSchema.parse(await request.json());
    const { user, session, admin } = await sessionAuthority(sessionId, [
      "host",
      "moderator",
    ]);
    if (
      input.role === "host" ||
      (input.role === "moderator" && user.id === userId)
    )
      throw new HttpError(403, "This role change is not permitted.");
    await rateLimit("moderation", user.id, 60, 60);
    await changeSessionRole({
      admin,
      actorUserId: user.id,
      targetUserId: userId,
      sessionId,
      roomId: session.room_id,
      meetingId: session.provider_meeting_id,
      nextRole: input.role,
      permanent: input.permanent,
    });
    if (input.role === "audience") {
      await admin.from("stage_requests").update({ status: "completed", resolved_at: new Date().toISOString(), resolved_by: user.id }).eq("session_id", sessionId).eq("user_id", userId).eq("status", "approved");
    }
    return NextResponse.json({ ok: true });
  } catch (error) {
    return apiError(error, "participant_role_failed");
  }
}
