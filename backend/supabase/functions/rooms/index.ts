import { z } from "npm:zod@4.5.4";
import { Router } from "../_shared/router.ts";
import { json, apiError } from "../_shared/http.ts";
import { HttpError, requireUser, sessionAuthority } from "../_shared/auth.ts";
import { createAdminClient, createAnonClient } from "../_shared/supabase.ts";
import { rateLimit, clientIp } from "../_shared/rate-limit.ts";
import { log } from "../_shared/log.ts";
import {
  joinRoomSchema,
  roomSlugSchema,
  uuidSchema,
} from "../_shared/validation.ts";

/** Bearer token is optional on the join path: audience members arrive without one. */
async function optionalUser(request: Request) {
  try {
    return await requireUser(request);
  } catch {
    return null;
  }
}

const router = new Router("rooms");

/* ── GET /rooms/live ─────────────────────────────────────────────────────── */
router.get("/live", async (request) => {
  try {
    const admin = createAdminClient();
    const { data, error } = await admin
      .from("sessions")
      .select("id,title,started_at,rooms!inner(id,slug,name,description,access_mode,status)")
      .eq("status", "live")
      .eq("rooms.status", "active")
      .eq("rooms.access_mode", "public")
      .order("started_at", { ascending: false });
    if (error) throw error;
    return json(request, {
      rooms: (data ?? []).map((item) => {
        const room = item.rooms as unknown as {
          id: string; slug: string; name: string; description: string | null;
        };
        return {
          id: room.id,
          slug: room.slug,
          name: room.name,
          description: room.description,
          sessionId: item.id,
          title: item.title,
          startedAt: item.started_at,
        };
      }),
    });
  } catch (error) {
    return apiError(request, error, "live_rooms_failed");
  }
});

/* ── POST /rooms/join ────────────────────────────────────────────────────── */
router.post("/join", async (request) => {
  try {
    const body = joinRoomSchema.parse(await request.json());
    const admin = createAdminClient();
    let user = await optionalUser(request);

    // Session minted here when we create an anonymous identity, so the browser
    // can adopt it. Returned to the caller, never persisted server-side.
    let issuedSession:
      | { access_token: string; refresh_token: string }
      | undefined;

    if (body.requestHost) {
      if (!user || user.is_anonymous)
        return json(request, { error: "Host authorization required." }, { status: 403 });

      const { data: room } = await admin
        .from("rooms")
        .select("id,name,access_mode")
        .eq("slug", body.slug)
        .eq("status", "active")
        .maybeSingle();
      if (!room) return json(request, { error: "Room unavailable." }, { status: 404 });

      const { data: member } = await admin
        .from("room_members")
        .select("role,status")
        .eq("room_id", room.id)
        .eq("user_id", user.id)
        .maybeSingle();
      if (!member || member.status !== "active" || member.role !== "host")
        return json(request, { error: "Host authorization required." }, { status: 403 });

      if (body.accessMode && body.accessMode !== room.access_mode) {
        const { error: accessError } = await admin
          .from("rooms")
          .update({ access_mode: body.accessMode })
          .eq("id", room.id);
        if (accessError) throw accessError;
      }

      await admin.from("profiles").upsert({ user_id: user.id, display_name: body.displayName });

      const { data: session, error: sessionError } = await admin
        .from("sessions")
        .select("id,status")
        .eq("room_id", room.id)
        .eq("status", "live")
        .maybeSingle();
      if (sessionError) throw sessionError;
      if (!session)
        return json(request, {
          error: "No live session in this room. Start one from the Host workspace.",
        }, { status: 409 });

      return json(request, {
        data: {
          room_id: room.id,
          room_name: room.name,
          role: "host",
          session_id: session.id,
          session_status: session.status,
          access_mode: body.accessMode ?? room.access_mode,
        },
      });
    }

    // IP limit runs BEFORE any identity exists. This ordering is the whole
    // point: it cannot be bypassed by clearing storage or rotating identity,
    // which is exactly what would happen if the browser called
    // signInAnonymously() for itself.
    await rateLimit("room-join-ip", clientIp(request), 20, 300);

    if (!user) {
      const result = await createAnonClient().auth.signInAnonymously();
      if (result.error || !result.data.user || !result.data.session)
        throw new Error("Anonymous authentication failed");
      user = result.data.user;
      issuedSession = {
        access_token: result.data.session.access_token,
        refresh_token: result.data.session.refresh_token,
      };
    }

    await rateLimit("room-join-user", user.id, 10, 300);

    if (!body.inviteToken) {
      const { data: publicRoom } = await admin
        .from("rooms")
        .select("id,name,access_mode")
        .eq("slug", body.slug)
        .eq("status", "active")
        .eq("access_mode", "public")
        .maybeSingle();
      if (!publicRoom)
        return json(request, { error: "An invitation is required for this room." }, { status: 403 });

      await admin.from("profiles").upsert({ user_id: user.id, display_name: body.displayName });

      const { data: existingMember, error: memberLookupError } = await admin
        .from("room_members")
        .select("role,status")
        .eq("room_id", publicRoom.id)
        .eq("user_id", user.id)
        .maybeSingle();
      if (memberLookupError) throw memberLookupError;

      if (existingMember && existingMember.status !== "active")
        return json(request, { error: "Room access denied." }, { status: 403 });

      let effectiveRole = existingMember?.role ?? "audience";
      if (!existingMember) {
        const { error: membershipError } = await admin.from("room_members").insert({
          room_id: publicRoom.id,
          user_id: user.id,
          role: "audience",
          status: "active",
        });
        if (membershipError) throw membershipError;
        effectiveRole = "audience";
      }

      const { data: session } = await admin
        .from("sessions")
        .select("id,status")
        .eq("room_id", publicRoom.id)
        .eq("status", "live")
        .maybeSingle();

      return json(request, {
        data: {
          room_id: publicRoom.id,
          room_name: publicRoom.name,
          role: effectiveRole,
          session_id: session?.id,
          session_status: session?.status,
        },
        session: issuedSession,
      });
    }

    const { data, error } = await admin.rpc("redeem_room_invite_server", {
      p_user_id: user.id,
      p_room_slug: body.slug,
      p_invite_token: body.inviteToken!,
      p_display_name: body.displayName,
    });
    if (error) {
      log("error", "invite_redemption_failed", {
        code: error.code,
        message: error.message,
        details: error.details,
        hint: error.hint,
      });
      return json(request, { error: "This invitation is invalid or unavailable." }, { status: 403 });
    }

    const membership = data?.[0];
    if (!membership)
      return json(request, { error: "This invitation is invalid or unavailable." }, { status: 403 });

    const { data: room } = await admin
      .from("rooms").select("name").eq("id", membership.room_id).single();
    const { data: session } = await admin
      .from("sessions").select("id,status")
      .eq("room_id", membership.room_id).eq("status", "live").maybeSingle();

    return json(request, {
      data: {
        room_id: membership.room_id,
        room_name: room?.name,
        role: membership.role,
        session_id: session?.id,
        session_status: session?.status,
      },
      session: issuedSession,
    });
  } catch (error) {
    return apiError(request, error, "room_join_failed");
  }
});

/* ── POST /rooms/recover ─────────────────────────────────────────────────── */
const recoverSchema = z.object({
  roomSlug: roomSlugSchema,
  sessionId: uuidSchema,
  clientInstanceId: z.string().uuid(),
});

router.post("/recover", async (request) => {
  try {
    const input = recoverSchema.parse(await request.json());
    const { user, member, session, admin } = await sessionAuthority(request, input.sessionId);
    if (session.status !== "live") throw new HttpError(409, "The session is no longer live.");
    const [{ data: room }, { data: participant }, { data: profile }, { data: note }] =
      await Promise.all([
        admin.from("rooms").select("id,slug,name,capacity,stage_capacity")
          .eq("id", session.room_id).eq("slug", input.roomSlug).single(),
        admin.from("session_participants").select("current_role")
          .eq("session_id", session.id).eq("user_id", user.id).maybeSingle(),
        admin.from("profiles").select("display_name").eq("user_id", user.id).single(),
        admin.from("session_notes").select("title,body,points,updated_at")
          .eq("session_id", session.id).maybeSingle(),
      ]);
    if (!room || !participant) throw new HttpError(403, "This room session cannot be recovered.");
    const { error } = await admin
      .from("session_participants")
      .update({
        client_instance_id: input.clientInstanceId,
        left_at: null,
        last_seen_at: new Date().toISOString(),
      })
      .eq("session_id", session.id)
      .eq("user_id", user.id);
    if (error) throw error;
    return json(request, {
      room: {
        id: room.id, slug: room.slug, name: room.name,
        capacity: room.capacity, stageCapacity: room.stage_capacity,
      },
      session: {
        id: session.id, title: session.title,
        status: session.status, endsAt: session.ends_at,
      },
      member: {
        userId: user.id,
        role: participant.current_role ?? member.role,
        displayName: profile?.display_name ?? "Participant",
      },
      notes: {
        title: note?.title ?? session.title,
        body: note?.body ?? session.agenda ?? "",
        points: Array.isArray(note?.points) ? note.points : [],
        updatedAt: note?.updated_at,
      },
      recovered: true,
    });
  } catch (error) {
    return apiError(request, error, "room_recovery_failed");
  }
});

Deno.serve((request) => router.handle(request));
