import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { joinRoomSchema } from "@/lib/validation/schemas";
import { apiError } from "@/lib/security/http";
import { rateLimit } from "@/lib/security/rate-limit";

export const runtime = "nodejs";

export async function POST(request: NextRequest) {
  try {
    const body = joinRoomSchema.parse(await request.json());
    const supabase = await createClient();
    const admin = createAdminClient();
    let {
      data: { user },
    } = await supabase.auth.getUser();

    if (body.requestHost) {
      if (!user || user.is_anonymous) {
        return NextResponse.json(
          { error: "Host authorization required." },
          { status: 403 },
        );
      }

      const { data: room } = await admin
        .from("rooms")
        .select("id,name,access_mode")
        .eq("slug", body.slug)
        .eq("status", "active")
        .maybeSingle();
      if (!room) {
        return NextResponse.json({ error: "Room unavailable." }, { status: 404 });
      }

      const { data: member } = await admin
        .from("room_members")
        .select("role,status")
        .eq("room_id", room.id)
        .eq("user_id", user.id)
        .maybeSingle();
      if (!member || member.status !== "active" || member.role !== "host") {
        return NextResponse.json(
          { error: "Host authorization required." },
          { status: 403 },
        );
      }

      if (body.accessMode && body.accessMode !== room.access_mode) {
        const { error: accessError } = await admin
          .from("rooms")
          .update({ access_mode: body.accessMode })
          .eq("id", room.id);
        if (accessError) throw accessError;
      }

      await admin
        .from("profiles")
        .upsert({ user_id: user.id, display_name: body.displayName });

      const { data: session, error: sessionError } = await admin
        .from("sessions")
        .select("id,status")
        .eq("room_id", room.id)
        .eq("status", "live")
        .maybeSingle();
      if (sessionError) throw sessionError;
      if (!session) {
        return NextResponse.json(
          { error: "No live session in this room. Start one from the Host workspace." },
          { status: 409 },
        );
      }

      return NextResponse.json({
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

    const clientIp =
      request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "unknown";
    await rateLimit("room-join-ip", clientIp, 20, 300);

    if (!user) {
      const result = await supabase.auth.signInAnonymously();
      if (result.error || !result.data.user) {
        throw new Error("Anonymous authentication failed");
      }
      user = result.data.user;
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
      if (!publicRoom) {
        return NextResponse.json(
          { error: "An invitation is required for this room." },
          { status: 403 },
        );
      }

      await admin
        .from("profiles")
        .upsert({ user_id: user.id, display_name: body.displayName });

      const { data: existingMember, error: memberLookupError } = await admin
        .from("room_members")
        .select("role,status")
        .eq("room_id", publicRoom.id)
        .eq("user_id", user.id)
        .maybeSingle();
      if (memberLookupError) throw memberLookupError;

      if (existingMember && existingMember.status !== "active") {
        return NextResponse.json({ error: "Room access denied." }, { status: 403 });
      }

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

      return NextResponse.json({
        data: {
          room_id: publicRoom.id,
          room_name: publicRoom.name,
          role: effectiveRole,
          session_id: session?.id,
          session_status: session?.status,
        },
      });
    }

    const { data, error } = await admin.rpc("redeem_room_invite_server", {
      p_user_id: user.id,
      p_room_slug: body.slug,
      p_invite_token: body.inviteToken!,
      p_display_name: body.displayName,
    });
    if (error) {
      console.error(
        JSON.stringify({
          level: "error",
          event: "invite_redemption_failed",
          code: error.code,
          message: error.message,
          details: error.details,
          hint: error.hint,
        }),
      );
      return NextResponse.json(
        { error: "This invitation is invalid or unavailable." },
        { status: 403 },
      );
    }

    const membership = data?.[0];
    if (!membership) {
      return NextResponse.json(
        { error: "This invitation is invalid or unavailable." },
        { status: 403 },
      );
    }

    const { data: room } = await admin
      .from("rooms")
      .select("name")
      .eq("id", membership.room_id)
      .single();
    const { data: session } = await admin
      .from("sessions")
      .select("id,status")
      .eq("room_id", membership.room_id)
      .eq("status", "live")
      .maybeSingle();

    return NextResponse.json({
      data: {
        room_id: membership.room_id,
        room_name: room?.name,
        role: membership.role,
        session_id: session?.id,
        session_status: session?.status,
      },
    });
  } catch (error) {
    return apiError(error, "room_join_failed");
  }
}
