import { randomUUID } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { createRoomSchema } from "@/lib/validation/schemas";
import { apiError } from "@/lib/security/http";
import { rateLimit } from "@/lib/security/rate-limit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

async function hostUser() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user || user.is_anonymous) return { supabase, user: null };
  return { supabase, user };
}

function baseSlug(name: string) {
  const value = name
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 62)
    .replace(/-+$/g, "");
  return value || "room";
}

export async function GET() {
  try {
    const { user } = await hostUser();
    if (!user) return NextResponse.json({ error: "Host sign in required." }, { status: 401 });

    const admin = createAdminClient();
    const { data: memberships, error: membershipError } = await admin
      .from("room_members")
      .select("room_id")
      .eq("user_id", user.id)
      .eq("role", "host")
      .eq("status", "active");
    if (membershipError) throw membershipError;

    const roomIds = (memberships ?? []).map((item) => item.room_id);
    const { data: profile } = await admin
      .from("profiles")
      .select("display_name")
      .eq("user_id", user.id)
      .maybeSingle();

    if (!roomIds.length) {
      return NextResponse.json({ rooms: [], displayName: profile?.display_name ?? "Host" });
    }

    const [{ data: rooms, error: roomsError }, { data: liveSessions, error: sessionsError }] = await Promise.all([
      admin
        .from("rooms")
        .select("id,slug,name,description,access_mode,status,created_at")
        .in("id", roomIds)
        .eq("status", "active")
        .order("created_at", { ascending: false }),
      admin
        .from("sessions")
        .select("id,room_id,title,agenda,goals,started_at")
        .in("room_id", roomIds)
        .eq("status", "live"),
    ]);
    if (roomsError) throw roomsError;
    if (sessionsError) throw sessionsError;

    const liveByRoom = new Map((liveSessions ?? []).map((session) => [session.room_id, session]));
    return NextResponse.json({
      displayName: profile?.display_name ?? "Host",
      rooms: (rooms ?? []).map((room) => {
        const live = liveByRoom.get(room.id);
        return {
          id: room.id,
          slug: room.slug,
          name: room.name,
          description: room.description,
          accessMode: room.access_mode,
          liveSession: live
            ? {
                id: live.id,
                title: live.title,
                agenda: live.agenda,
                goals: live.goals,
                startedAt: live.started_at,
              }
            : null,
        };
      }),
    });
  } catch (error) {
    return apiError(error, "host_rooms_list_failed");
  }
}

export async function POST(request: NextRequest) {
  try {
    const input = createRoomSchema.parse(await request.json());
    const { user } = await hostUser();
    if (!user) return NextResponse.json({ error: "Host sign in required." }, { status: 401 });

    const admin = createAdminClient();
    const { data: existingHost, error: hostError } = await admin
      .from("room_members")
      .select("room_id")
      .eq("user_id", user.id)
      .eq("role", "host")
      .eq("status", "active")
      .limit(1)
      .maybeSingle();
    if (hostError) throw hostError;
    if (!existingHost) return NextResponse.json({ error: "This account is not authorized to create rooms." }, { status: 403 });

    await rateLimit("host-room-create", user.id, 10, 60 * 60);

    const base = baseSlug(input.name);
    let slug = base;
    for (let attempt = 0; attempt < 5; attempt += 1) {
      const { data: collision } = await admin.from("rooms").select("id").eq("slug", slug).maybeSingle();
      if (!collision) break;
      slug = `${base.slice(0, 54)}-${randomUUID().slice(0, 6)}`;
    }

    const { data: room, error: roomError } = await admin
      .from("rooms")
      .insert({
        slug,
        name: input.name,
        description: input.description || null,
        room_type: "group",
        access_mode: input.accessMode,
        status: "active",
        created_by: user.id,
      })
      .select("id,slug,name,description,access_mode")
      .single();
    if (roomError) throw roomError;

    const { error: memberError } = await admin.from("room_members").insert({
      room_id: room.id,
      user_id: user.id,
      role: "host",
      status: "active",
    });
    if (memberError) {
      await admin.from("rooms").delete().eq("id", room.id);
      throw memberError;
    }

    return NextResponse.json({
      room: {
        id: room.id,
        slug: room.slug,
        name: room.name,
        description: room.description,
        accessMode: room.access_mode,
        liveSession: null,
      },
    }, { status: 201 });
  } catch (error) {
    return apiError(error, "host_room_create_failed");
  }
}
