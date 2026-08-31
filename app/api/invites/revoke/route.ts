import { NextResponse } from "next/server";
import { z } from "zod";
import { uuidSchema } from "@/lib/validation/schemas";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireMembership, HttpError } from "@/lib/security/auth";
import { apiError } from "@/lib/security/http";
import { audit } from "@/lib/room/audit";
export const runtime = "nodejs";
const schema = z.object({ inviteId: uuidSchema });
export async function POST(request: Request) {
  try {
    const { inviteId } = schema.parse(await request.json());
    const admin = createAdminClient();
    const { data: invite } = await admin
      .from("room_invites")
      .select("id,room_id")
      .eq("id", inviteId)
      .maybeSingle();
    if (!invite) throw new HttpError(404, "Invitation not found");
    const { user } = await requireMembership(invite.room_id, ["host"]);
    const now = new Date().toISOString();
    await admin
      .from("room_invites")
      .update({ revoked_at: now })
      .eq("id", inviteId);
    await audit(admin, {
      actor_user_id: user.id,
      target_user_id: null,
      room_id: invite.room_id,
      session_id: null,
      action: "invite_revoked",
      metadata: { invite_id: inviteId },
      created_at: now,
    });
    return NextResponse.json({ ok: true });
  } catch (error) {
    return apiError(error, "invite_revoke_failed");
  }
}
