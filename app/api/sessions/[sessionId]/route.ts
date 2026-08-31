import { NextResponse } from "next/server";
import { sessionAuthority } from "@/lib/security/auth";
import { apiError } from "@/lib/security/http";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export async function GET(
  _: Request,
  { params }: { params: Promise<{ sessionId: string }> },
) {
  try {
    const { sessionId } = await params;
    const { user, member, session, admin } = await sessionAuthority(sessionId);
    const [
      { data: room },
      { data: note },
      { data: attendance },
      { data: profile },
    ] = await Promise.all([
      admin
        .from("rooms")
        .select("id,slug,name,capacity,stage_capacity")
        .eq("id", session.room_id)
        .single(),
      admin
        .from("session_notes")
        .select("title,body,points,updated_at")
        .eq("session_id", sessionId)
        .maybeSingle(),
      admin
        .from("session_participants")
        .select("current_role")
        .eq("session_id", sessionId)
        .eq("user_id", user.id)
        .maybeSingle(),
      admin
        .from("profiles")
        .select("display_name")
        .eq("user_id", user.id)
        .single(),
    ]);
    if (!room) throw new Error("Room unavailable");
    return NextResponse.json({
      room: {
        id: room.id,
        slug: room.slug,
        name: room.name,
        capacity: room.capacity,
        stageCapacity: room.stage_capacity,
      },
      session: {
        id: session.id,
        title: session.title,
        status: session.status,
        endsAt: session.ends_at,
      },
      member: {
        userId: user.id,
        role: attendance?.current_role ?? member.role,
        displayName: profile?.display_name ?? "Participant",
      },
      notes: {
        title: note?.title ?? session.title,
        body: note?.body ?? session.agenda ?? "",
        points: Array.isArray(note?.points) ? note.points : [],
        updatedAt: note?.updated_at,
      },
    });
  } catch (error) {
    return apiError(error, "session_bootstrap_failed");
  }
}
