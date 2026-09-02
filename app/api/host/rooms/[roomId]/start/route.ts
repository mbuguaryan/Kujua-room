import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { startSessionSchema, uuidSchema } from "@/lib/validation/schemas";
import { apiError } from "@/lib/security/http";
import { rateLimit } from "@/lib/security/rate-limit";
import { mediaAdapter } from "@/lib/media";
import { audit } from "@/lib/room/audit";

export const runtime = "nodejs";

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ roomId: string }> },
) {
  try {
    const { roomId: rawRoomId } = await params;
    const roomId = uuidSchema.parse(rawRoomId);
    const input = startSessionSchema.parse(await request.json());
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user || user.is_anonymous) {
      return NextResponse.json({ error: "Host sign in required." }, { status: 401 });
    }

    const admin = createAdminClient();
    const [{ data: member, error: memberError }, { data: room, error: roomError }] = await Promise.all([
      admin
        .from("room_members")
        .select("role,status")
        .eq("room_id", roomId)
        .eq("user_id", user.id)
        .maybeSingle(),
      admin
        .from("rooms")
        .select("id,slug,name,access_mode,status")
        .eq("id", roomId)
        .maybeSingle(),
    ]);
    if (memberError) throw memberError;
    if (roomError) throw roomError;
    if (!room || room.status !== "active") {
      return NextResponse.json({ error: "Room unavailable." }, { status: 404 });
    }
    if (!member || member.role !== "host" || member.status !== "active") {
      return NextResponse.json({ error: "Host authorization required." }, { status: 403 });
    }

    await rateLimit("host-session-start", `${user.id}:${roomId}`, 12, 60 * 60);

    const { data: live, error: liveError } = await admin
      .from("sessions")
      .select("id,title,status")
      .eq("room_id", roomId)
      .eq("status", "live")
      .maybeSingle();
    if (liveError) throw liveError;
    if (live) {
      return NextResponse.json(
        { error: `“${live.title}” is already live in this room.`, sessionId: live.id },
        { status: 409 },
      );
    }

    const now = new Date().toISOString();
    const meeting = await mediaAdapter().createMeeting(input.title);
    const { data: session, error: sessionError } = await admin
      .from("sessions")
      .insert({
        room_id: roomId,
        title: input.title,
        agenda: input.agenda || null,
        goals: input.goals || null,
        status: "live",
        created_by: user.id,
        created_at: now,
        started_at: now,
        media_provider: "cloudflare-realtimekit",
        provider_meeting_id: meeting.meetingId,
        media_created_at: now,
      })
      .select("id,title,status")
      .single();

    if (sessionError?.code === "23505") {
      const { data: existing } = await admin
        .from("sessions")
        .select("id,title,status")
        .eq("room_id", roomId)
        .eq("status", "live")
        .maybeSingle();
      return NextResponse.json(
        { error: existing ? `“${existing.title}” is already live in this room.` : "A session is already live in this room.", sessionId: existing?.id },
        { status: 409 },
      );
    }
    if (sessionError) throw sessionError;

    await audit(admin, {
      actor_user_id: user.id,
      target_user_id: null,
      room_id: roomId,
      session_id: session.id,
      action: "session_started",
      metadata: {
        source: "host_workspace",
        title: input.title,
        access_mode: room.access_mode,
      },
      created_at: now,
    });

    return NextResponse.json({
      data: {
        sessionId: session.id,
        slug: room.slug,
        accessMode: room.access_mode,
      },
    }, { status: 201 });
  } catch (error) {
    return apiError(error, "host_session_start_failed");
  }
}
