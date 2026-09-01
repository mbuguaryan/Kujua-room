import { NextResponse } from "next/server";
import { sessionAuthority, HttpError } from "@/lib/security/auth";
import { apiError } from "@/lib/security/http";
import { stageRequestSchema } from "@/lib/validation/schemas";
import { rateLimit } from "@/lib/security/rate-limit";
import { changeSessionRole } from "@/lib/room/moderation";
import { audit } from "@/lib/room/audit";

export const runtime = "nodejs";

type StageRow = {
  id: string;
  user_id: string;
  status: string;
  note: string | null;
  requested_at: string;
  created_at: string;
};

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ sessionId: string }> },
) {
  try {
    const { sessionId } = await params;
    const auth = await sessionAuthority(sessionId);
    const { user, member, admin } = auth;

    if (member.role === "host" || member.role === "moderator") {
      const { data, error } = await admin
        .from("stage_requests")
        .select("id,user_id,status,note,requested_at,created_at")
        .eq("session_id", sessionId)
        .eq("status", "pending")
        .order("requested_at", { ascending: true });
      if (error) throw error;

      const rows = (data ?? []) as StageRow[];
      const userIds = [...new Set(rows.map((row) => row.user_id))];
      const names = new Map<string, string>();
      if (userIds.length > 0) {
        const { data: profiles, error: profileError } = await admin
          .from("profiles")
          .select("user_id,display_name")
          .in("user_id", userIds);
        if (profileError) throw profileError;
        for (const profile of profiles ?? []) {
          names.set(profile.user_id, profile.display_name ?? "Participant");
        }
      }

      return NextResponse.json({
        requests: rows.map((row) => ({
          id: row.id,
          userId: row.user_id,
          displayName: names.get(row.user_id) ?? "Participant",
          note: row.note,
          requestedAt: row.requested_at ?? row.created_at,
        })),
      });
    }

    const { data, error } = await admin
      .from("stage_requests")
      .select("id,status,note,requested_at,resolved_at,created_at")
      .eq("session_id", sessionId)
      .eq("user_id", user.id)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (error) throw error;

    return NextResponse.json({
      request: data
        ? {
            id: data.id,
            status: data.status,
            note: data.note,
            requestedAt: data.requested_at ?? data.created_at,
            resolvedAt: data.resolved_at,
          }
        : null,
    });
  } catch (error) {
    return apiError(error, "stage_request_read_failed");
  }
}

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
      await rateLimit("stage-request", user.id, 20, 60);
      const { data: existing, error: existingError } = await admin
        .from("stage_requests")
        .select("*")
        .eq("session_id", sessionId)
        .eq("user_id", user.id)
        .eq("status", "pending")
        .maybeSingle();
      if (existingError) throw existingError;
      if (existing) return NextResponse.json({ request: existing });

      const now = new Date().toISOString();
      const { data, error } = await admin
        .from("stage_requests")
        .insert({
          session_id: sessionId,
          user_id: user.id,
          status: "pending",
          note: input.note ?? null,
          resolved_by: null,
          resolved_at: null,
          requested_at: now,
          created_at: now,
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
          syncProviderRole: false,
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

    return NextResponse.json({ ok: true, status, userId: stage.user_id });
  } catch (error) {
    return apiError(error, "stage_request_failed");
  }
}
