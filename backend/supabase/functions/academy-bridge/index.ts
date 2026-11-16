import { z } from "npm:zod@4.5.4";
import { Router } from "../_shared/router.ts";
import { apiError, json } from "../_shared/http.ts";
import { HttpError } from "../_shared/auth.ts";
import { createAdminClient, createAnonClient } from "../_shared/supabase.ts";
import { mediaAdapter } from "../_shared/media/index.ts";
import { serverEnv } from "../_shared/env.ts";
import { academySlug, randomToken, requireAcademyBridge, sha256 } from "../_shared/academy-bridge.ts";

const router = new Router("academy-bridge");
const id = z.string().trim().min(1).max(200);
const provisionSchema = z.object({
  academySessionId: id, externalSessionId: id.optional(), teacherId: id,
  cohortId: id, title: z.string().trim().min(1).max(160),
  scheduledAt: z.string().datetime(),
});
const actorSchema = z.object({ academySessionId: id, teacherId: id });
const intentSchema = z.object({
  academySessionId: id, userId: id, displayName: z.string().trim().min(1).max(80),
  role: z.enum(["host", "audience"]),
});
const redeemSchema = z.object({ token: z.string().regex(/^[0-9a-f]{64}$/) });

type Untyped = ReturnType<typeof createAdminClient>;
const table = (client: Untyped, name: string) => client.from(name as never) as any;

router.post("/provision", async (request) => {
  try {
    requireAcademyBridge(request);
    const input = provisionSchema.parse(await request.json());
    const admin = createAdminClient();
    const { data: existing } = await table(admin, "academy_live_sessions")
      .select("*").eq("academy_session_id", input.academySessionId).maybeSingle();
    if (existing) {
      if (existing.teacher_external_id !== input.teacherId || existing.cohort_external_id !== input.cohortId)
        throw new HttpError(409, "Academy session mapping conflicts with the existing classroom");
      return json(request, { data: existing });
    }
    const slug = await academySlug(input.academySessionId);
    const { data: room, error: roomError } = await admin.from("rooms").insert({
      slug, name: input.title, room_type: "group", access_mode: "private",
      description: "Kujua Point Academy classroom",
    }).select("id,slug").single();
    if (roomError) throw roomError;
    const { data: session, error: sessionError } = await admin.from("sessions").insert({
      room_id: room.id, title: input.title, status: "scheduled",
      scheduled_at: input.scheduledAt,
    }).select("id").single();
    if (sessionError) throw sessionError;
    const { data, error } = await table(admin, "academy_live_sessions").insert({
      academy_session_id: input.academySessionId, external_session_id: input.externalSessionId ?? null,
      teacher_external_id: input.teacherId, cohort_external_id: input.cohortId,
      room_id: room.id, session_id: session.id,
    }).select("*").single();
    if (error) throw error;
    return json(request, { data }, { status: 201 });
  } catch (error) { return apiError(request, error, "academy_provision_failed"); }
});

router.post("/start", async (request) => {
  try {
    requireAcademyBridge(request);
    const input = actorSchema.parse(await request.json());
    const admin = createAdminClient();
    const { data: mapping } = await table(admin, "academy_live_sessions")
      .select("*").eq("academy_session_id", input.academySessionId).maybeSingle();
    if (!mapping) throw new HttpError(404, "Academy classroom not found");
    if (mapping.teacher_external_id !== input.teacherId) throw new HttpError(403, "Teacher is not assigned to this classroom");
    if (mapping.state === "live") return json(request, { data: mapping });
    if (mapping.state !== "scheduled") throw new HttpError(409, "Classroom cannot be started");
    const { data: claimed } = await table(admin, "academy_live_sessions").update({ state: "starting" })
      .eq("academy_session_id", input.academySessionId).eq("state", "scheduled").select("session_id").maybeSingle();
    if (!claimed) throw new HttpError(409, "Classroom start is already in progress");
    try {
      const { data: session, error: sessionError } = await admin.from("sessions")
        .select("id,title,provider_meeting_id").eq("id", mapping.session_id).single();
      if (sessionError) throw sessionError;
      const meetingId = session.provider_meeting_id ?? (await mediaAdapter().createMeeting(session.title)).meetingId;
      const now = new Date().toISOString();
      const { error } = await admin.from("sessions").update({
        status: "live", started_at: now, media_provider: "cloudflare-realtimekit",
        provider_meeting_id: meetingId, media_created_at: now,
      }).eq("id", mapping.session_id).eq("status", "scheduled");
      if (error) throw error;
      await table(admin, "academy_live_sessions").update({ state: "live" })
        .eq("academy_session_id", input.academySessionId);
      return json(request, { data: { ...mapping, state: "live" } });
    } catch (error) {
      await table(admin, "academy_live_sessions").update({ state: "scheduled" })
        .eq("academy_session_id", input.academySessionId).eq("state", "starting");
      throw error;
    }
  } catch (error) { return apiError(request, error, "academy_start_failed"); }
});

router.post("/join-intent", async (request) => {
  try {
    requireAcademyBridge(request);
    const input = intentSchema.parse(await request.json());
    const admin = createAdminClient();
    const { data: mapping } = await table(admin, "academy_live_sessions")
      .select("*").eq("academy_session_id", input.academySessionId).maybeSingle();
    if (!mapping || mapping.state !== "live") throw new HttpError(409, "Classroom is not live");
    if (input.role === "host" && mapping.teacher_external_id !== input.userId)
      throw new HttpError(403, "Teacher is not assigned to this classroom");
    const token = randomToken();
    const expiresAt = new Date(Date.now() + 5 * 60_000).toISOString();
    const { error } = await table(admin, "academy_join_intents").insert({
      token_hash: await sha256(token), academy_session_id: input.academySessionId,
      external_user_id: input.userId, display_name: input.displayName,
      room_role: input.role, expires_at: expiresAt,
    });
    if (error) throw error;
    const publicUrl = serverEnv().ROOM_PUBLIC_URL;
    if (!publicUrl) throw new Error("ROOM_PUBLIC_URL is required");
    return json(request, { data: { url: `${publicUrl.replace(/\/$/, "")}/academy/join?token=${token}`, expiresAt } });
  } catch (error) { return apiError(request, error, "academy_join_intent_failed"); }
});

router.post("/redeem", async (request) => {
  let createdUserId: string | undefined;
  try {
    const input = redeemSchema.parse(await request.json());
    const admin = createAdminClient();
    const hash = await sha256(input.token);
    const { data: intent } = await table(admin, "academy_join_intents")
      .select("*,academy_live_sessions!inner(room_id,session_id,state,rooms!inner(slug))")
      .eq("token_hash", hash).is("consumed_at", null).gt("expires_at", new Date().toISOString()).maybeSingle();
    if (!intent || intent.academy_live_sessions.state !== "live") throw new HttpError(401, "Join credential is invalid or expired");
    const identityId = crypto.randomUUID();
    const email = `academy-${identityId}@room.invalid`;
    const password = randomToken();
    const created = await admin.auth.admin.createUser({
      id: identityId, email, password, email_confirm: true,
      user_metadata: { display_name: intent.display_name, academy: true },
    });
    if (created.error || !created.data.user) throw new Error("Room identity could not be created");
    createdUserId = created.data.user.id;
    const auth = await createAnonClient().auth.signInWithPassword({ email, password });
    if (auth.error || !auth.data.session) throw new Error("Room identity session could not be created");
    const now = new Date().toISOString();
    const { data: consumed } = await table(admin, "academy_join_intents").update({ consumed_at: now })
      .eq("id", intent.id).is("consumed_at", null).select("id").maybeSingle();
    if (!consumed) throw new HttpError(401, "Join credential has already been used");
    await admin.from("profiles").upsert({ user_id: createdUserId, display_name: intent.display_name });
    await admin.from("room_members").upsert({
      room_id: intent.academy_live_sessions.room_id, user_id: createdUserId,
      role: intent.room_role, status: "active",
    });
    await table(admin, "academy_room_identities").insert({
      room_user_id: createdUserId, academy_session_id: intent.academy_session_id,
      external_user_id: intent.external_user_id, room_role: intent.room_role,
    });
    return json(request, { data: {
      slug: intent.academy_live_sessions.rooms.slug, role: intent.room_role,
      displayName: intent.display_name,
      session: { access_token: auth.data.session.access_token, refresh_token: auth.data.session.refresh_token },
    } });
  } catch (error) {
    if (createdUserId) await createAdminClient().auth.admin.deleteUser(createdUserId).catch(() => undefined);
    return apiError(request, error, "academy_redeem_failed");
  }
});

router.post("/end", async (request) => {
  try {
    requireAcademyBridge(request);
    const input = actorSchema.parse(await request.json());
    const admin = createAdminClient();
    const { data: mapping } = await table(admin, "academy_live_sessions").select("*")
      .eq("academy_session_id", input.academySessionId).maybeSingle();
    if (!mapping) throw new HttpError(404, "Academy classroom not found");
    if (mapping.teacher_external_id !== input.teacherId) throw new HttpError(403, "Teacher is not assigned to this classroom");
    if (mapping.state === "completed") {
      const { data } = await table(admin, "academy_participation").select("*")
        .eq("academy_session_id", input.academySessionId);
      return json(request, { data: { attendance: data ?? [] } });
    }
    if (mapping.state !== "live") throw new HttpError(409, "Classroom is not live");
    const now = new Date().toISOString();
    await (admin.rpc as any)("finalize_academy_participation", { p_academy_session_id: input.academySessionId, p_occurred_at: now });
    await admin.from("sessions").update({ status: "ended", ended_at: now }).eq("id", mapping.session_id).eq("status", "live");
    await table(admin, "academy_live_sessions").update({ state: "completed" }).eq("academy_session_id", input.academySessionId);
    const { data } = await table(admin, "academy_participation").select("*")
      .eq("academy_session_id", input.academySessionId);
    return json(request, { data: { attendance: data ?? [] } });
  } catch (error) { return apiError(request, error, "academy_end_failed"); }
});

router.post("/status", async (request) => {
  try {
    requireAcademyBridge(request);
    const { academySessionId } = z.object({ academySessionId: id }).parse(await request.json());
    const admin = createAdminClient();
    const { data: mapping } = await table(admin, "academy_live_sessions").select("*")
      .eq("academy_session_id", academySessionId).maybeSingle();
    const { data: attendance } = mapping ? await table(admin, "academy_participation").select("*")
      .eq("academy_session_id", academySessionId) : { data: [] };
    return json(request, { data: mapping ? { ...mapping, attendance: attendance ?? [] } : null });
  } catch (error) { return apiError(request, error, "academy_status_failed"); }
});

router.post("/cancel", async (request) => {
  try {
    requireAcademyBridge(request);
    const input = actorSchema.parse(await request.json());
    const admin = createAdminClient();
    const { data: mapping } = await table(admin, "academy_live_sessions").select("*")
      .eq("academy_session_id", input.academySessionId).maybeSingle();
    if (!mapping) return json(request, { data: { cancelled: false } });
    if (mapping.teacher_external_id !== input.teacherId) throw new HttpError(403, "Teacher is not assigned to this classroom");
    if (mapping.state === "completed") throw new HttpError(409, "Completed classroom cannot be cancelled");
    await admin.from("sessions").update({ status: "cancelled" }).eq("id", mapping.session_id).in("status", ["scheduled", "live"]);
    await table(admin, "academy_live_sessions").update({ state: "cancelled" }).eq("academy_session_id", input.academySessionId);
    await table(admin, "academy_join_intents").update({ consumed_at: new Date().toISOString() })
      .eq("academy_session_id", input.academySessionId).is("consumed_at", null);
    return json(request, { data: { cancelled: true } });
  } catch (error) { return apiError(request, error, "academy_cancel_failed"); }
});

router.post("/reconcile", async (request) => {
  try {
    requireAcademyBridge(request);
    const input = provisionSchema.parse(await request.json());
    const admin = createAdminClient();
    const { data: mapping } = await table(admin, "academy_live_sessions").select("*")
      .eq("academy_session_id", input.academySessionId).maybeSingle();
    if (!mapping) return json(request, { data: { reconciled: false } });
    if (mapping.teacher_external_id !== input.teacherId || mapping.cohort_external_id !== input.cohortId)
      throw new HttpError(409, "Academy session mapping conflicts with the existing classroom");
    if (mapping.state === "scheduled") {
      await admin.from("sessions").update({ title: input.title, scheduled_at: input.scheduledAt })
        .eq("id", mapping.session_id).eq("status", "scheduled");
      await admin.from("rooms").update({ name: input.title }).eq("id", mapping.room_id);
    }
    return json(request, { data: { reconciled: true, state: mapping.state } });
  } catch (error) { return apiError(request, error, "academy_reconcile_failed"); }
});

Deno.serve((request) => router.handle(request));
