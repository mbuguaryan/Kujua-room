import { NextResponse } from "next/server";
import { sessionAuthority } from "@/lib/security/auth";
import { apiError } from "@/lib/security/http";
import { notesSchema } from "@/lib/validation/schemas";
import { audit } from "@/lib/room/audit";
export const runtime = "nodejs";
export async function PUT(
  request: Request,
  { params }: { params: Promise<{ sessionId: string }> },
) {
  try {
    const { sessionId } = await params;
    const input = notesSchema.parse(await request.json());
    const { user, session, admin } = await sessionAuthority(sessionId, [
      "host",
      "moderator",
    ]);
    const now = new Date().toISOString();
    const { data, error } = await admin
      .from("session_notes")
      .upsert(
        {
          session_id: sessionId,
          ...input,
          updated_by: user.id,
          updated_at: now,
        },
        { onConflict: "session_id" },
      )
      .select("*")
      .single();
    if (error) throw error;
    await audit(admin, {
      actor_user_id: user.id,
      room_id: session.room_id,
      session_id: sessionId,
      target_user_id: null,
      action: "shared_notes_updated",
      metadata: {},
      created_at: now,
    });
    return NextResponse.json({ notes: data });
  } catch (error) {
    return apiError(error, "session_notes_update_failed");
  }
}
