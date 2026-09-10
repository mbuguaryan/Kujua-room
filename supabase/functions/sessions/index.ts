import { z } from "zod";
import { Router } from "../_shared/router.ts";
import { json, apiError } from "../_shared/http.ts";
import {
  HttpError,
  requireMembership,
  sessionAuthority,
} from "../_shared/auth.ts";
import { createAdminClient } from "../_shared/supabase.ts";
import { rateLimit } from "../_shared/rate-limit.ts";
import { mediaAdapter } from "../_shared/media/index.ts";
import { audit } from "../_shared/audit.ts";
import { changeSessionRole } from "../_shared/moderation.ts";
import { stageGet, stagePost } from "./stage.ts";
import {
  messageSchema,
  notesSchema,
  roleChangeSchema,
  uuidSchema,
} from "@/lib/validation/schemas.ts";

const router = new Router("sessions");

/* ── POST /sessions — create a scheduled session ─────────────────────────── */
const createSchema = z.object({
  roomId: uuidSchema,
  title: z.string().trim().min(1).max(160),
  agenda: z.string().trim().max(4000).optional(),
  points: z.array(z.string().trim().min(1).max(500)).max(30).default([]),
});

router.post("/", async (request) => {
  try {
    const input = createSchema.parse(await request.json());
    const { user } = await requireMembership(request, input.roomId, ["host"]);
    const admin = createAdminClient();
    const { data: live } = await admin
      .from("sessions").select("id")
      .eq("room_id", input.roomId).eq("status", "live").maybeSingle();
    if (live) return json(request, { error: "A session is already live." }, { status: 409 });

    const now = new Date().toISOString();
    const { data: session, error } = await admin
      .from("sessions")
      .insert({
        room_id: input.roomId, title: input.title,
        agenda: input.agenda ?? null, status: "scheduled",
        created_by: user.id, created_at: now,
      })
      .select("*").single();
    if (error) throw error;
    await admin.from("session_notes").insert({
      session_id: session.id, title: input.title,
      body: input.agenda ?? "", points: input.points,
      updated_by: user.id, updated_at: now,
    });
    await audit(admin, {
      actor_user_id: user.id, target_user_id: null,
      room_id: input.roomId, session_id: session.id,
      action: "session_created", metadata: {}, created_at: now,
    });
    return json(request, { session }, { status: 201 });
  } catch (error) {
    return apiError(request, error, "session_create_failed");
  }
});

/* ── GET /sessions/:sessionId — bootstrap ────────────────────────────────── */
router.get("/:sessionId", async (request, { sessionId }) => {
  try {
    const { user, member, session, admin } = await sessionAuthority(request, sessionId);
    const currentSession = session as typeof session & { goals?: string | null };
    const [{ data: room }, { data: note }, { data: attendance }, { data: profile }] =
      await Promise.all([
        admin.from("rooms").select("id,slug,name,capacity,stage_capacity")
          .eq("id", session.room_id).single(),
        admin.from("session_notes").select("title,body,points,updated_at")
          .eq("session_id", sessionId).maybeSingle(),
        admin.from("session_participants").select("current_role")
          .eq("session_id", sessionId).eq("user_id", user.id).maybeSingle(),
        admin.from("profiles").select("display_name").eq("user_id", user.id).single(),
      ]);
    if (!room) throw new Error("Room unavailable");
    const storedRole = attendance?.current_role ?? member.role;
    const goals = currentSession.goals ?? null;
    return json(request, {
      room: {
        id: room.id, slug: room.slug, name: room.name,
        capacity: room.capacity, stageCapacity: room.stage_capacity,
      },
      session: {
        id: session.id, title: session.title,
        agenda: session.agenda ?? null, goals,
        status: session.status, endsAt: session.ends_at,
      },
      member: {
        userId: user.id, role: storedRole,
        displayName: profile?.display_name ?? "Participant",
      },
      notes: {
        title: note?.title ?? "Live notes",
        body: note?.body ?? "",
        points: Array.isArray(note?.points) ? note.points : [],
        updatedAt: note?.updated_at,
        sessionTitle: session.title,
        agenda: session.agenda ?? null,
        goals,
      },
    });
  } catch (error) {
    return apiError(request, error, "session_bootstrap_failed");
  }
});

/* ── POST /sessions/:sessionId/start ─────────────────────────────────────── */
router.post("/:sessionId/start", async (request, { sessionId }) => {
  try {
    const { user, session, admin } = await sessionAuthority(request, sessionId, ["host"]);
    await rateLimit("session-control", user.id, 20, 60);
    if (session.status === "live") return json(request, { session });
    if (!["scheduled"].includes(session.status))
      throw new HttpError(409, "This session cannot be started.");
    const meetingId =
      session.provider_meeting_id ??
      (await mediaAdapter().createMeeting(session.title)).meetingId;
    const now = new Date().toISOString();
    const { data, error } = await admin
      .from("sessions")
      .update({
        status: "live", started_at: now,
        media_provider: "cloudflare-realtimekit",
        provider_meeting_id: meetingId,
        media_created_at: session.media_created_at ?? now,
      })
      .eq("id", sessionId).eq("status", "scheduled")
      .select("*").single();
    if (error?.code === "23505")
      throw new HttpError(409, "Another session is already live in this room.");
    if (error) throw error;
    await audit(admin, {
      actor_user_id: user.id, room_id: session.room_id,
      session_id: sessionId, target_user_id: null,
      action: "session_started", metadata: {}, created_at: now,
    });
    return json(request, { session: data });
  } catch (error) {
    return apiError(request, error, "session_start_failed");
  }
});

/* ── POST /sessions/:sessionId/end ───────────────────────────────────────── */
router.post("/:sessionId/end", async (request, { sessionId }) => {
  try {
    const { user, session, admin } = await sessionAuthority(request, sessionId, ["host"]);
    await rateLimit("session-control", user.id, 20, 60);
    if (session.status !== "live") throw new HttpError(409, "The session is not live.");
    const endsAt = new Date(Date.now() + 60_000).toISOString();
    const { error } = await admin
      .from("sessions").update({ ends_at: endsAt })
      .eq("id", sessionId).eq("status", "live");
    if (error) throw error;
    await audit(admin, {
      actor_user_id: user.id, room_id: session.room_id,
      session_id: sessionId, target_user_id: null,
      action: "session_ending", metadata: { ends_at: endsAt },
      created_at: new Date().toISOString(),
    });
    return json(request, { endsAt });
  } catch (error) {
    return apiError(request, error, "session_end_failed");
  }
});

/* ── POST /sessions/:sessionId/finalize ──────────────────────────────────── */
router.post("/:sessionId/finalize", async (request, { sessionId }) => {
  try {
    const { user, session, admin } = await sessionAuthority(request, sessionId);
    if (!session.ends_at || new Date(session.ends_at).getTime() > Date.now())
      throw new HttpError(409, "The ending countdown is still active.");
    const now = new Date().toISOString();
    await admin.from("sessions")
      .update({ status: "ended", ended_at: now })
      .eq("id", sessionId).eq("status", "live");
    await admin.from("session_participants")
      .update({ left_at: now, last_seen_at: now })
      .eq("session_id", sessionId).is("left_at", null);
    await audit(admin, {
      actor_user_id: user.id, target_user_id: null,
      room_id: session.room_id, session_id: sessionId,
      action: "session_ended", metadata: {}, created_at: now,
    });
    return json(request, { ok: true });
  } catch (error) {
    return apiError(request, error, "session_finalize_failed");
  }
});

/* ── POST /sessions/:sessionId/join ──────────────────────────────────────── */
router.post("/:sessionId/join", async (request, { sessionId }) => {
  try {
    const { user, member, session, admin } = await sessionAuthority(request, sessionId);
    if (session.status !== "live") throw new HttpError(409, "The session is not live.");
    const now = new Date().toISOString();
    const { data: profile } = await admin
      .from("profiles").select("display_name").eq("user_id", user.id).single();
    const { data: existing } = await admin
      .from("session_participants").select("id,current_role")
      .eq("session_id", sessionId).eq("user_id", user.id).maybeSingle();
    if (existing) {
      await admin.from("session_participants")
        .update({
          left_at: null, last_seen_at: now,
          display_name: profile?.display_name ?? "Participant",
        })
        .eq("id", existing.id);
    } else {
      await admin.from("session_participants").insert({
        session_id: sessionId, room_id: session.room_id, user_id: user.id,
        display_name: profile?.display_name ?? "Participant",
        role_snapshot: member.role, current_role: member.role,
        joined_at: now, left_at: null, last_seen_at: now,
      });
    }
    return json(request, { ok: true, role: existing?.current_role ?? member.role });
  } catch (error) {
    return apiError(request, error, "session_join_failed");
  }
});

/* ── POST /sessions/:sessionId/leave ─────────────────────────────────────── */
router.post("/:sessionId/leave", async (request, { sessionId }) => {
  try {
    const { user, admin } = await sessionAuthority(request, sessionId);
    const now = new Date().toISOString();
    await admin.from("session_participants")
      .update({ left_at: now, last_seen_at: now })
      .eq("session_id", sessionId).eq("user_id", user.id);
    return json(request, { ok: true });
  } catch (error) {
    return apiError(request, error, "session_leave_failed");
  }
});

/* ── POST /sessions/:sessionId/media-token ───────────────────────────────── */
router.post("/:sessionId/media-token", async (request, { sessionId }) => {
  try {
    const { user, member, session, admin } = await sessionAuthority(request, sessionId);
    if (session.status !== "live" || !session.provider_meeting_id)
      throw new HttpError(409, "The session is not live.");
    await rateLimit("media-token", `${user.id}:${sessionId}`, 10, 60, admin);
    const { data: attendance } = await admin
      .from("session_participants").select("current_role")
      .eq("session_id", sessionId).eq("user_id", user.id).maybeSingle();
    const role = attendance?.current_role ?? member.role;
    const { data: profile } = await admin
      .from("profiles").select("display_name").eq("user_id", user.id).single();
    const token = await mediaAdapter().addParticipant({
      meetingId: session.provider_meeting_id,
      userId: user.id,
      name: profile?.display_name ?? "Participant",
      role,
    });
    await admin.from("media_participants").upsert(
      {
        session_id: sessionId, user_id: user.id,
        provider_participant_id: token.participantId,
        provider_preset_name: token.presetName,
        provider_meeting_id: session.provider_meeting_id,
        provider: "cloudflare-realtimekit",
        joined_at: new Date().toISOString(),
        left_at: null, updated_at: new Date().toISOString(),
      },
      { onConflict: "session_id,user_id" },
    );
    return json(request, token);
  } catch (error) {
    return apiError(request, error, "media_token_failed");
  }
});

/* ── GET/POST /sessions/:sessionId/messages ──────────────────────────────── */
router.get("/:sessionId/messages", async (request, { sessionId }) => {
  try {
    const { user, admin } = await sessionAuthority(request, sessionId);
    const cursor = new URL(request.url).searchParams.get("cursor");
    let query = admin
      .from("room_messages")
      .select("id,session_id,room_id,sender_id,recipient_id,message,message_type,created_at")
      .eq("session_id", sessionId)
      .or(`recipient_id.is.null,sender_id.eq.${user.id},recipient_id.eq.${user.id}`)
      .order("created_at", { ascending: false })
      .limit(50);
    if (cursor) query = query.lt("created_at", cursor);
    const { data, error } = await query;
    if (error) throw error;
    const ids = [...new Set((data ?? []).map((x) => x.sender_id))];
    const { data: profiles } = ids.length
      ? await admin.from("profiles").select("user_id,display_name").in("user_id", ids)
      : { data: [] };
    const names = new Map((profiles ?? []).map((x) => [x.user_id, x.display_name]));
    return json(request, {
      messages: (data ?? []).reverse().map((x) => ({
        id: x.id, sessionId: x.session_id, roomId: x.room_id,
        senderId: x.sender_id, recipientId: x.recipient_id,
        senderName: names.get(x.sender_id) ?? "Participant",
        message: x.message, messageType: x.message_type, createdAt: x.created_at,
      })),
      nextCursor: data?.length === 50 ? data[data.length - 1].created_at : null,
    });
  } catch (error) {
    return apiError(request, error, "messages_read_failed");
  }
});

router.post("/:sessionId/messages", async (request, { sessionId }) => {
  try {
    const input = messageSchema.parse(await request.json());
    const { user, session, admin } = await sessionAuthority(request, sessionId);
    if (session.status !== "live") throw new HttpError(409, "The session is not live.");
    await rateLimit("room-message", user.id, 30, 60);
    if (input.recipientId) {
      const { data: recipient } = await admin
        .from("session_participants").select("user_id")
        .eq("session_id", sessionId).eq("user_id", input.recipientId)
        .is("left_at", null).maybeSingle();
      if (!recipient) throw new HttpError(400, "Recipient is not active in this session.");
    }
    const { data, error } = await admin
      .from("room_messages")
      .insert({
        session_id: sessionId, room_id: session.room_id,
        sender_id: user.id, recipient_id: input.recipientId ?? null,
        message: input.message, message_type: "text",
      })
      .select("id,session_id,room_id,sender_id,recipient_id,message,message_type,created_at")
      .single();
    if (error) throw error;
    return json(request, { message: data }, { status: 201 });
  } catch (error) {
    return apiError(request, error, "message_send_failed");
  }
});

/* ── PUT /sessions/:sessionId/notes ──────────────────────────────────────── */
router.put("/:sessionId/notes", async (request, { sessionId }) => {
  try {
    const input = notesSchema.parse(await request.json());
    const { user, session, admin } = await sessionAuthority(request, sessionId, ["host", "moderator"]);
    const now = new Date().toISOString();
    const { data, error } = await admin
      .from("session_notes")
      .upsert(
        { session_id: sessionId, ...input, updated_by: user.id, updated_at: now },
        { onConflict: "session_id" },
      )
      .select("*").single();
    if (error) throw error;
    await audit(admin, {
      actor_user_id: user.id, room_id: session.room_id,
      session_id: sessionId, target_user_id: null,
      action: "shared_notes_updated", metadata: {}, created_at: now,
    });
    return json(request, { notes: data });
  } catch (error) {
    return apiError(request, error, "session_notes_update_failed");
  }
});

/* ── POST /sessions/:sessionId/voice-activity ────────────────────────────── */
router.post("/:sessionId/voice-activity", async (request, { sessionId }) => {
  try {
    const { user, session, admin } = await sessionAuthority(request, sessionId);
    await rateLimit("voice-activity", user.id, 12, 60, admin);
    if (session.status !== "live") throw new HttpError(409, "The session is not live.");
    const { data, error } = await admin.rpc("record_session_voice_activity", {
      p_session_id: sessionId,
    });
    if (error) throw error;
    if (!data) throw new HttpError(409, "The session is no longer live.");
    return json(request, { ok: true, recordedAt: data });
  } catch (error) {
    return apiError(request, error, "voice_activity_failed");
  }
});

/* ── GET/POST /sessions/:sessionId/stage ─────────────────────────────────── */
router.get("/:sessionId/stage", (request, params) =>
  stageGet(request, params as { sessionId: string }));
router.post("/:sessionId/stage", (request, params) =>
  stagePost(request, params as { sessionId: string }));

/* ── POST /sessions/:sessionId/participants/mute-all ─────────────────────── */
router.post("/:sessionId/participants/mute-all", async (request, { sessionId }) => {
  try {
    const { user, session, admin } = await sessionAuthority(request, sessionId, ["host", "moderator"]);
    await rateLimit("moderation", user.id, 60, 60);
    const now = new Date().toISOString();
    await admin.from("moderation_events").insert({
      actor_user_id: user.id, target_user_id: null, session_id: sessionId,
      action: "mute", metadata: { scope: "all", allow_self_unmute: true },
      created_at: now,
    });
    await audit(admin, {
      actor_user_id: user.id, target_user_id: null,
      room_id: session.room_id, session_id: sessionId,
      action: "participants_mute_all_requested",
      metadata: { allow_self_unmute: true }, created_at: now,
    });
    return json(request, { ok: true, providerAction: "client_mute_all", allowSelfUnmute: true });
  } catch (error) {
    return apiError(request, error, "participants_mute_all_failed");
  }
});

/* ── POST /sessions/:sessionId/participants/:userId/mute ─────────────────── */
router.post("/:sessionId/participants/:userId/mute", async (request, { sessionId, userId }) => {
  try {
    const { user, session, admin } = await sessionAuthority(request, sessionId, ["host", "moderator"]);
    await rateLimit("moderation", user.id, 60, 60);
    await audit(admin, {
      actor_user_id: user.id, target_user_id: userId,
      room_id: session.room_id, session_id: sessionId,
      action: "participant_mute_requested", metadata: {},
      created_at: new Date().toISOString(),
    });
    return json(request, {
      ok: true, providerAction: "client_disable_audio",
      targetUserId: userId, allowSelfUnmute: true,
    });
  } catch (error) {
    return apiError(request, error, "participant_mute_failed");
  }
});

/* ── POST /sessions/:sessionId/participants/:userId/remove ───────────────── */
router.post("/:sessionId/participants/:userId/remove", async (request, { sessionId, userId }) => {
  try {
    const body = (await request.json().catch(() => ({}))) as { block?: boolean };
    const { user, session, admin } = await sessionAuthority(request, sessionId, ["host", "moderator"]);
    await rateLimit("moderation", user.id, 60, 60);
    const now = new Date().toISOString();
    const { data: media } = await admin
      .from("media_participants").select("provider_participant_id")
      .eq("session_id", sessionId).eq("user_id", userId).maybeSingle();
    if (media?.provider_participant_id && session.provider_meeting_id)
      await mediaAdapter().removeParticipant({
        meetingId: session.provider_meeting_id,
        participantId: media.provider_participant_id,
      });
    const { error: attendanceError } = await admin
      .from("session_participants")
      .update({ left_at: now, last_seen_at: now })
      .eq("session_id", sessionId).eq("user_id", userId);
    if (attendanceError) throw attendanceError;
    if (body.block) {
      const { error: blockError } = await admin
        .from("room_members").update({ status: "blocked" })
        .eq("room_id", session.room_id).eq("user_id", userId);
      if (blockError) throw blockError;
    }
    const action = body.block ? "member_blocked" : "participant_removed";
    const { error: eventError } = await admin.from("moderation_events").insert({
      actor_user_id: user.id, target_user_id: userId, session_id: sessionId,
      action, metadata: {}, created_at: now,
    });
    if (eventError) throw eventError;
    await audit(admin, {
      actor_user_id: user.id, target_user_id: userId,
      room_id: session.room_id, session_id: sessionId,
      action, metadata: {}, created_at: now,
    });
    return json(request, { ok: true });
  } catch (error) {
    return apiError(request, error, "participant_remove_failed");
  }
});

/* ── PUT /sessions/:sessionId/participants/:userId/role ──────────────────── */
router.put("/:sessionId/participants/:userId/role", async (request, { sessionId, userId }) => {
  try {
    const input = roleChangeSchema.parse(await request.json());
    const { user, member, session, admin } = await sessionAuthority(request, sessionId, ["host", "moderator"]);

    if (input.role === "host")
      throw new HttpError(403, "The host role cannot be assigned from this endpoint.");

    // Moderators may manage speaking state, but only the host can create other
    // moderators or make a room-level role change permanent.
    if (member.role !== "host" && (input.role === "moderator" || Boolean(input.permanent)))
      throw new HttpError(403, "Only the host can make this role change.");

    if (input.role === "moderator" && user.id === userId)
      throw new HttpError(403, "You cannot promote yourself to moderator.");

    await rateLimit("moderation", user.id, 60, 60);
    await changeSessionRole({
      admin, actorUserId: user.id, targetUserId: userId,
      sessionId, roomId: session.room_id,
      meetingId: session.provider_meeting_id,
      nextRole: input.role, permanent: input.permanent,
    });
    if (input.role === "audience") {
      await admin.from("stage_requests")
        .update({
          status: "completed",
          resolved_at: new Date().toISOString(),
          resolved_by: user.id,
        })
        .eq("session_id", sessionId).eq("user_id", userId).eq("status", "approved");
    }
    return json(request, { ok: true });
  } catch (error) {
    return apiError(request, error, "participant_role_failed");
  }
});

Deno.serve((request) => router.handle(request));
