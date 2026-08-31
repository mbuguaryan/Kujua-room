import { NextResponse } from "next/server";
import { z } from "zod";
import { uuidSchema } from "@/lib/validation/schemas";
import { requireMembership } from "@/lib/security/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { apiError } from "@/lib/security/http";
import { audit } from "@/lib/room/audit";
export const runtime = "nodejs";
const schema = z.object({
  roomId: uuidSchema,
  title: z.string().trim().min(1).max(160),
  agenda: z.string().trim().max(4000).optional(),
  points: z.array(z.string().trim().min(1).max(500)).max(30).default([]),
});
export async function POST(request: Request) {
  try {
    const input = schema.parse(await request.json());
    const { user } = await requireMembership(input.roomId, ["host"]);
    const admin = createAdminClient();
    const { data: live } = await admin
      .from("sessions")
      .select("id")
      .eq("room_id", input.roomId)
      .eq("status", "live")
      .maybeSingle();
    if (live)
      return NextResponse.json(
        { error: "A session is already live." },
        { status: 409 },
      );
    const now = new Date().toISOString();
    const { data: session, error } = await admin
      .from("sessions")
      .insert({
        room_id: input.roomId,
        title: input.title,
        agenda: input.agenda ?? null,
        status: "scheduled",
        created_by: user.id,
        created_at: now,
      })
      .select("*")
      .single();
    if (error) throw error;
    await admin
      .from("session_notes")
      .insert({
        session_id: session.id,
        title: input.title,
        body: input.agenda ?? "",
        points: input.points,
        updated_by: user.id,
        updated_at: now,
      });
    await audit(admin, {
      actor_user_id: user.id,
      target_user_id: null,
      room_id: input.roomId,
      session_id: session.id,
      action: "session_created",
      metadata: {},
      created_at: now,
    });
    return NextResponse.json({ session }, { status: 201 });
  } catch (error) {
    return apiError(error, "session_create_failed");
  }
}
