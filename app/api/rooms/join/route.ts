import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { joinRoomSchema } from "@/lib/validation/schemas";
import { apiError } from "@/lib/security/http";
import { rateLimit } from "@/lib/security/rate-limit";
import { mediaAdapter } from "@/lib/media";
import { audit } from "@/lib/room/audit";
export const runtime = "nodejs";
export async function POST(request: NextRequest) {
  try {
    const body = joinRoomSchema.parse(await request.json());
    const supabase = await createClient();
    const admin = createAdminClient();
    let { data: { user } } = await supabase.auth.getUser();
    if (body.requestHost) {
      if (!user || user.is_anonymous) return NextResponse.json({ error: "Host authorization required." }, { status: 403 });
      const { data: room } = await admin.from("rooms").select("id,name,access_mode").eq("slug", body.slug).eq("status", "active").maybeSingle();
      if (!room) return NextResponse.json({ error: "Room unavailable." }, { status: 404 });
      const { data: member } = await admin.from("room_members").select("role,status").eq("room_id", room.id).eq("user_id", user.id).maybeSingle();
      if (!member || member.status !== "active" || member.role !== "host") return NextResponse.json({ error: "Host authorization required." }, { status: 403 });
      if (body.accessMode && body.accessMode !== room.access_mode) {
        const { error: accessError } = await admin.from("rooms").update({ access_mode: body.accessMode }).eq("id", room.id);
        if (accessError) throw accessError;
      }
      await admin.from("profiles").upsert({ user_id: user.id, display_name: body.displayName });
      let { data: session } = await admin.from("sessions").select("id,status").eq("room_id", room.id).eq("status", "live").maybeSingle();
      if (!session) {
        const now = new Date().toISOString();
        const meeting = await mediaAdapter().createMeeting(room.name);
        const { data: created, error: createError } = await admin.from("sessions").insert({ room_id: room.id, title: room.name, agenda: null, status: "live", created_by: user.id, created_at: now, started_at: now, media_provider: "cloudflare-realtimekit", provider_meeting_id: meeting.meetingId, media_created_at: now }).select("id,status").single();
        if (createError?.code === "23505") {
          const { data: existing } = await admin.from("sessions").select("id,status").eq("room_id", room.id).eq("status", "live").maybeSingle();
          session = existing;
        } else if (createError) throw createError;
        else {
          session = created;
          if (session) await audit(admin, { actor_user_id: user.id, target_user_id: null, room_id: room.id, session_id: session.id, action: "session_started", metadata: { source: "host_join", access_mode: body.accessMode ?? room.access_mode }, created_at: now });
        }
      }
      return NextResponse.json({ data: { room_id: room.id, room_name: room.name, role: "host", session_id: session?.id, session_status: session?.status, access_mode: body.accessMode ?? room.access_mode } });
    }
    if (!user) {
      const result = await supabase.auth.signInAnonymously();
      if (result.error || !result.data.user) throw new Error("Anonymous authentication failed");
      user = result.data.user;
    }
    await rateLimit("room-join", `${request.headers.get("x-forwarded-for") ?? "unknown"}:${user.id}`, 10, 300);
    if (!body.inviteToken) {
      const { data: publicRoom } = await admin.from("rooms").select("id,name,access_mode").eq("slug", body.slug).eq("status", "active").eq("access_mode", "public").maybeSingle();
      if (!publicRoom) return NextResponse.json({ error: "An invitation is required for this room." }, { status: 403 });
      await admin.from("profiles").upsert({ user_id: user.id, display_name: body.displayName });
      await admin.from("room_members").upsert({ room_id: publicRoom.id, user_id: user.id, role: "audience", status: "active" }, { onConflict: "room_id,user_id" });
      const { data: session } = await admin.from("sessions").select("id,status").eq("room_id", publicRoom.id).eq("status", "live").maybeSingle();
      return NextResponse.json({ data: { room_id: publicRoom.id, room_name: publicRoom.name, role: "audience", session_id: session?.id, session_status: session?.status } });
    }
    const { data, error } = await admin.rpc("redeem_room_invite_server", { p_user_id: user.id, p_room_slug: body.slug, p_invite_token: body.inviteToken!, p_display_name: body.displayName });
    if (error) {
      console.error(JSON.stringify({ level: "error", event: "invite_redemption_failed", code: error.code, message: error.message, details: error.details, hint: error.hint }));
      return NextResponse.json({ error: "This invitation is invalid or unavailable." }, { status: 403 });
    }
    const membership = data?.[0];
    if (!membership) return NextResponse.json({ error: "This invitation is invalid or unavailable." }, { status: 403 });
    const { data: room } = await admin.from("rooms").select("name").eq("id", membership.room_id).single();
    const { data: session } = await admin.from("sessions").select("id,status").eq("room_id", membership.room_id).eq("status", "live").maybeSingle();
    return NextResponse.json({ data: { room_id: membership.room_id, room_name: room?.name, role: membership.role, session_id: session?.id, session_status: session?.status } });
  } catch (error) {
    return apiError(error, "room_join_failed");
  }
}
