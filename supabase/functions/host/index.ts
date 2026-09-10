import { randomUUID } from "node:crypto";
import { Router } from "../_shared/router.ts";
import { json, apiError } from "../_shared/http.ts";
import { HttpError, requireUser } from "../_shared/auth.ts";
import { createAdminClient, createAnonClient } from "../_shared/supabase.ts";
import { rateLimit, clientIp } from "../_shared/rate-limit.ts";
import { mediaAdapter } from "../_shared/media/index.ts";
import { audit } from "../_shared/audit.ts";
import type { Database } from "@/lib/supabase/database.types.ts";
import {
  createRoomSchema,
  hostLoginSchema,
  startSessionSchema,
  uuidSchema,
} from "@/lib/validation/schemas.ts";

type SessionInsert = Database["public"]["Tables"]["sessions"]["Insert"];
type SessionInsertWithGoals = SessionInsert & { goals?: string | null };

type SessionPlanRow = {
  id: string; room_id: string; title: string;
  agenda: string | null; goals?: string | null; started_at: string | null;
};

/** Host routes require a real account, never an anonymous audience identity. */
async function hostUser(request: Request) {
  const user = await requireUser(request);
  if (user.is_anonymous) throw new HttpError(401, "Host sign in required.");
  return user;
}

function baseSlug(name: string) {
  const value = name
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 62)
    .replace(/-+$/g, "");
  return value || "room";
}

const router = new Router("host");

/* ── POST /host/login ────────────────────────────────────────────────────── */
router.post("/login", async (request) => {
  try {
    const input = hostLoginSchema.parse(await request.json());

    // Rate limit before the password is ever checked. Signing in from the
    // browser instead would put every attempt outside this limiter and leave
    // brute-force protection to Supabase Auth's much coarser defaults.
    await rateLimit(
      "host-login",
      `${clientIp(request)}:${input.email.toLowerCase()}`,
      8,
      15 * 60,
    );

    const { data, error } = await createAnonClient().auth.signInWithPassword(input);
    if (error || !data.user || !data.session)
      return json(request, { error: "Incorrect email or password." }, { status: 401 });

    const admin = createAdminClient();
    const { data: membership, error: membershipError } = await admin
      .from("room_members").select("room_id")
      .eq("user_id", data.user.id).eq("role", "host")
      .eq("status", "active").limit(1).maybeSingle();
    if (membershipError) throw membershipError;

    // No session is returned to a non-host, so the browser never adopts one.
    if (!membership)
      return json(request, {
        error: "This account is not authorized as a Kujua Room host.",
      }, { status: 403 });

    return json(request, {
      ok: true,
      session: {
        access_token: data.session.access_token,
        refresh_token: data.session.refresh_token,
      },
    });
  } catch (error) {
    if (error instanceof HttpError && error.status === 429)
      return json(request, {
        error: "Too many sign-in attempts. Please try again later.",
      }, { status: 429 });
    return apiError(request, error, "host_login_failed");
  }
});

/* ── GET /host/rooms ─────────────────────────────────────────────────────── */
router.get("/rooms", async (request) => {
  try {
    const user = await hostUser(request);
    const admin = createAdminClient();
    const { data: memberships, error: membershipError } = await admin
      .from("room_members").select("room_id")
      .eq("user_id", user.id).eq("role", "host").eq("status", "active");
    if (membershipError) throw membershipError;

    const roomIds = (memberships ?? []).map((item) => item.room_id);
    const { data: profile } = await admin
      .from("profiles").select("display_name").eq("user_id", user.id).maybeSingle();

    if (!roomIds.length)
      return json(request, { rooms: [], displayName: profile?.display_name ?? "Host" });

    const [{ data: rooms, error: roomsError }, { data: liveSessionRows, error: sessionsError }] =
      await Promise.all([
        admin.from("rooms")
          .select("id,slug,name,description,access_mode,status,created_at")
          .in("id", roomIds).eq("status", "active")
          .order("created_at", { ascending: false }),
        admin.from("sessions").select("*").in("room_id", roomIds).eq("status", "live"),
      ]);
    if (roomsError) throw roomsError;
    if (sessionsError) throw sessionsError;

    const liveSessions = (liveSessionRows ?? []) as unknown as SessionPlanRow[];
    const liveByRoom = new Map(liveSessions.map((session) => [session.room_id, session]));
    return json(request, {
      displayName: profile?.display_name ?? "Host",
      rooms: (rooms ?? []).map((room) => {
        const live = liveByRoom.get(room.id);
        return {
          id: room.id, slug: room.slug, name: room.name,
          description: room.description, accessMode: room.access_mode,
          liveSession: live
            ? {
                id: live.id, title: live.title, agenda: live.agenda,
                goals: live.goals ?? null, startedAt: live.started_at,
              }
            : null,
        };
      }),
    });
  } catch (error) {
    return apiError(request, error, "host_rooms_list_failed");
  }
});

/* ── POST /host/rooms ────────────────────────────────────────────────────── */
router.post("/rooms", async (request) => {
  try {
    const input = createRoomSchema.parse(await request.json());
    const user = await hostUser(request);
    const admin = createAdminClient();

    const { data: existingHost, error: hostError } = await admin
      .from("room_members").select("room_id")
      .eq("user_id", user.id).eq("role", "host").eq("status", "active")
      .limit(1).maybeSingle();
    if (hostError) throw hostError;
    if (!existingHost)
      return json(request, {
        error: "This account is not authorized to create rooms.",
      }, { status: 403 });

    await rateLimit("host-room-create", user.id, 10, 60 * 60);

    const base = baseSlug(input.name);
    let slug = base;
    for (let attempt = 0; attempt < 5; attempt += 1) {
      const { data: collision } = await admin
        .from("rooms").select("id").eq("slug", slug).maybeSingle();
      if (!collision) break;
      slug = `${base.slice(0, 54)}-${randomUUID().slice(0, 6)}`;
    }

    const { data: room, error: roomError } = await admin
      .from("rooms")
      .insert({
        slug, name: input.name,
        description: input.description || null,
        room_type: "group", access_mode: input.accessMode,
        status: "active", created_by: user.id,
      })
      .select("id,slug,name,description,access_mode").single();
    if (roomError) throw roomError;

    const { error: memberError } = await admin.from("room_members").insert({
      room_id: room.id, user_id: user.id, role: "host", status: "active",
    });
    if (memberError) {
      await admin.from("rooms").delete().eq("id", room.id);
      throw memberError;
    }

    return json(request, {
      room: {
        id: room.id, slug: room.slug, name: room.name,
        description: room.description, accessMode: room.access_mode,
        liveSession: null,
      },
    }, { status: 201 });
  } catch (error) {
    return apiError(request, error, "host_room_create_failed");
  }
});

/* ── POST /host/rooms/:roomId/start ──────────────────────────────────────── */
router.post("/rooms/:roomId/start", async (request, params) => {
  try {
    const roomId = uuidSchema.parse(params.roomId);
    const input = startSessionSchema.parse(await request.json());
    const user = await hostUser(request);
    const admin = createAdminClient();

    const [{ data: member, error: memberError }, { data: room, error: roomError }] =
      await Promise.all([
        admin.from("room_members").select("role,status")
          .eq("room_id", roomId).eq("user_id", user.id).maybeSingle(),
        admin.from("rooms").select("id,slug,name,access_mode,status")
          .eq("id", roomId).maybeSingle(),
      ]);
    if (memberError) throw memberError;
    if (roomError) throw roomError;
    if (!room || room.status !== "active")
      return json(request, { error: "Room unavailable." }, { status: 404 });
    if (!member || member.role !== "host" || member.status !== "active")
      return json(request, { error: "Host authorization required." }, { status: 403 });

    await rateLimit("host-session-start", `${user.id}:${roomId}`, 12, 60 * 60);

    const { data: live, error: liveError } = await admin
      .from("sessions").select("id,title,status")
      .eq("room_id", roomId).eq("status", "live").maybeSingle();
    if (liveError) throw liveError;
    if (live)
      return json(request, {
        error: `“${live.title}” is already live in this room.`,
        sessionId: live.id,
      }, { status: 409 });

    const now = new Date().toISOString();
    const meeting = await mediaAdapter().createMeeting(input.title);
    const sessionInsert: SessionInsertWithGoals = {
      room_id: roomId, title: input.title,
      agenda: input.agenda || null, goals: input.goals || null,
      status: "live", created_by: user.id, created_at: now, started_at: now,
      media_provider: "cloudflare-realtimekit",
      provider_meeting_id: meeting.meetingId, media_created_at: now,
    };
    const { data: session, error: sessionError } = await admin
      .from("sessions").insert(sessionInsert as SessionInsert)
      .select("id,title,status").single();

    if (sessionError?.code === "23505") {
      const { data: existing } = await admin
        .from("sessions").select("id,title,status")
        .eq("room_id", roomId).eq("status", "live").maybeSingle();
      return json(request, {
        error: existing
          ? `“${existing.title}” is already live in this room.`
          : "A session is already live in this room.",
        sessionId: existing?.id,
      }, { status: 409 });
    }
    if (sessionError) throw sessionError;

    await audit(admin, {
      actor_user_id: user.id, target_user_id: null,
      room_id: roomId, session_id: session.id,
      action: "session_started",
      metadata: {
        source: "host_workspace",
        title: input.title,
        access_mode: room.access_mode,
      },
      created_at: now,
    });

    return json(request, {
      data: { sessionId: session.id, slug: room.slug, accessMode: room.access_mode },
    }, { status: 201 });
  } catch (error) {
    return apiError(request, error, "host_session_start_failed");
  }
});

Deno.serve((request) => router.handle(request));
