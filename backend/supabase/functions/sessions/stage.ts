import { json, apiError } from "../_shared/http.ts";
import { HttpError, sessionAuthority } from "../_shared/auth.ts";
import { rateLimit } from "../_shared/rate-limit.ts";
import { audit } from "../_shared/audit.ts";
import { stageRequestSchema } from "../_shared/validation.ts";

type Params = { sessionId: string };

/**
 * Stage requests live in their own module so the invariant stays a file-level
 * guarantee: nothing here may promote a participant's database role.
 * tests/microphone-wiring.test.ts asserts that by scanning this file, and
 * folding these handlers in beside the participant-role endpoint would have
 * silently defeated the check — that endpoint promotes roles by design.
 */

/* ── GET/POST /sessions/:sessionId/stage ─────────────────────────────────── */
type StageRow = {
  id: string; user_id: string; status: string;
  note: string | null; requested_at: string; created_at: string;
};

export async function stageGet(request: Request, { sessionId }: Params) {
  try {
    const { user, member, admin } = await sessionAuthority(request, sessionId);

    if (member.role === "host" || member.role === "moderator") {
      const { data, error } = await admin
        .from("stage_requests")
        .select("id,user_id,status,note,requested_at,created_at")
        .eq("session_id", sessionId).eq("status", "pending")
        .order("requested_at", { ascending: true });
      if (error) throw error;

      const rows = (data ?? []) as StageRow[];
      const userIds = [...new Set(rows.map((row) => row.user_id))];
      const names = new Map<string, string>();
      if (userIds.length > 0) {
        const { data: profiles, error: profileError } = await admin
          .from("profiles").select("user_id,display_name").in("user_id", userIds);
        if (profileError) throw profileError;
        for (const profile of profiles ?? [])
          names.set(profile.user_id, profile.display_name ?? "Participant");
      }

      return json(request, {
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
      .eq("session_id", sessionId).eq("user_id", user.id)
      .order("created_at", { ascending: false }).limit(1).maybeSingle();
    if (error) throw error;

    return json(request, {
      request: data
        ? {
            id: data.id, status: data.status, note: data.note,
            requestedAt: data.requested_at ?? data.created_at,
            resolvedAt: data.resolved_at,
          }
        : null,
    });
  } catch (error) {
    return apiError(request, error, "stage_request_read_failed");
  }
}

export async function stagePost(request: Request, { sessionId }: Params) {
  try {
    const input = stageRequestSchema.parse(await request.json());
    const { user, admin } = await sessionAuthority(request, sessionId);

    if (input.action === "raise") {
      await rateLimit("stage-request", user.id, 20, 60);
      const { data: existing, error: existingError } = await admin
        .from("stage_requests").select("*")
        .eq("session_id", sessionId).eq("user_id", user.id)
        .eq("status", "pending").maybeSingle();
      if (existingError) throw existingError;
      if (existing) return json(request, { request: existing });

      const now = new Date().toISOString();
      const { data, error } = await admin
        .from("stage_requests")
        .insert({
          session_id: sessionId, user_id: user.id, status: "pending",
          note: input.note ?? null, resolved_by: null, resolved_at: null,
          requested_at: now, created_at: now,
        })
        .select("*").single();
      if (error) throw error;
      return json(request, { request: data });
    }

    if (input.action === "cancel") {
      const { error } = await admin
        .from("stage_requests")
        .update({ status: "cancelled", resolved_at: new Date().toISOString() })
        .eq("session_id", sessionId).eq("user_id", user.id).eq("status", "pending");
      if (error) throw error;
      return json(request, { ok: true });
    }

    if (!input.requestId) throw new HttpError(400, "Stage request is required.");

    const privileged = await sessionAuthority(request, sessionId, ["host", "moderator"]);
    await rateLimit("moderation", privileged.user.id, 60, 60);
    const status = input.action === "approve" ? "approved" : "declined";
    const { data: stage, error } = await admin
      .from("stage_requests")
      .update({
        status, resolved_by: privileged.user.id,
        resolved_at: new Date().toISOString(),
      })
      .eq("id", input.requestId).eq("session_id", sessionId).eq("status", "pending")
      .select("user_id").single();
    if (error) throw error;

    // RealtimeKit owns temporary speaking state. We deliberately do not
    // promote session_participants.current_role here. The participant remains
    // audience in our authorization model while RealtimeKit stageStatus
    // controls whether the microphone is available.
    if (status === "declined") {
      const now = new Date().toISOString();
      await privileged.admin.from("moderation_events").insert({
        actor_user_id: privileged.user.id, target_user_id: stage.user_id,
        session_id: sessionId, action: "stage_request_declined",
        metadata: {}, created_at: now,
      });
      await audit(privileged.admin, {
        actor_user_id: privileged.user.id, target_user_id: stage.user_id,
        room_id: privileged.session.room_id, session_id: sessionId,
        action: "stage_request_declined", metadata: {}, created_at: now,
      });
    }

    return json(request, { ok: true, status, userId: stage.user_id });
  } catch (error) {
    return apiError(request, error, "stage_request_failed");
  }
}
