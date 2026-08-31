import { NextResponse } from "next/server";
import { sessionAuthority, HttpError } from "@/lib/security/auth";
import { apiError } from "@/lib/security/http";
import { stageRequestSchema } from "@/lib/validation/schemas";
import { rateLimit } from "@/lib/security/rate-limit";
import { changeSessionRole } from "@/lib/room/moderation";
import { audit } from "@/lib/room/audit";
export const runtime = "nodejs";
export async function POST(
  request: Request,
  { params }: { params: Promise<{ sessionId: string }> },
) {
  try {
    const { sessionId } = await params;
    const input = stageRequestSchema.parse(await request.json());
    const auth = await sessionAuthority(sessionId);
    const { user, admin } = auth;
    if (input.action === "raise") {
      const { data, error } = await admin
        .from("stage_requests")
        .insert({
          session_id: sessionId,
          user_id: user.id,
          status: "pending",
          note: input.note ?? null,
          resolved_by: null,
          resolved_at: null,
          created_at: new Date().toISOString(),
        })
        .select("*")
        .single();
      if (error) throw error;
      return NextResponse.json({ request: data });
    }
    if (input.action === "cancel") {
      const { error } = await admin
        .from("stage_requests")
        .update({ status: "cancelled", resolved_at: new Date().toISOString() })
        .eq("session_id", sessionId)
        .eq("user_id", user.id)
        .eq("status", "pending");
      if (error) throw error;
      return NextResponse.json({ ok: true });
    }
    if (!input.requestId)
      throw new HttpError(400, "Stage request is required.");
    const privileged = await sessionAuthority(sessionId, ["host", "moderator"]);
    await rateLimit("moderation", privileged.user.id, 60, 60);
    const status = input.action === "approve" ? "approved" : "declined";
    const { data: stage, error } = await admin
      .from("stage_requests")
      .update({
        status,
        resolved_by: privileged.user.id,
        resolved_at: new Date().toISOString(),
      })
      .eq("id", input.requestId)
      .eq("session_id", sessionId)
      .eq("status", "pending")
      .select("user_id")
      .single();
    if (error) throw error;
    if (status === "approved") {
      try {
        await changeSessionRole({
          admin: privileged.admin,
          actorUserId: privileged.user.id,
          targetUserId: stage.user_id,
          sessionId,
          roomId: privileged.session.room_id,
          meetingId: privileged.session.provider_meeting_id,
          nextRole: "speaker",
        });
      } catch (promotionError) {
        await privileged.admin
          .from("stage_requests")
          .update({ status: "pending", resolved_by: null, resolved_at: null })
          .eq("id", input.requestId);
        throw promotionError;
      }
    } else {
      const now = new Date().toISOString();
      await privileged.admin.from("moderation_events").insert({
        actor_user_id: privileged.user.id,
        target_user_id: stage.user_id,
        session_id: sessionId,
        action: "stage_request_declined",
        metadata: {},
        created_at: now,
      });
      await audit(privileged.admin, {
        actor_user_id: privileged.user.id,
        target_user_id: stage.user_id,
        room_id: privileged.session.room_id,
        session_id: sessionId,
        action: "stage_request_declined",
        metadata: {},
        created_at: now,
      });
    }
    return NextResponse.json({ ok: true });
  } catch (error) {
    return apiError(error, "stage_request_failed");
  }
}
