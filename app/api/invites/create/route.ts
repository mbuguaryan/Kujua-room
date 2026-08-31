import { randomBytes, createHash } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireMembership } from "@/lib/security/auth";
import { apiError } from "@/lib/security/http";
import { rateLimit } from "@/lib/security/rate-limit";
import { audit } from "@/lib/room/audit";
import { uuidSchema } from "@/lib/validation/schemas";
import { z } from "zod";
const schema = z.object({
  roomId: uuidSchema,
  expiresAt: z.string().datetime().optional(),
  maxUses: z.number().int().positive().max(5000).optional(),
});
export const runtime = "nodejs";
export async function POST(request: NextRequest) {
  try {
    const input = schema.parse(await request.json());
    const { user } = await requireMembership(input.roomId, ["host"]);
    await rateLimit("invite-create", user.id, 20, 3600);
    const token = randomBytes(32).toString("base64url");
    const hash = createHash("sha256").update(token).digest("hex");
    const admin = createAdminClient();
    const now = new Date().toISOString();
    const { data, error } = await admin
      .from("room_invites")
      .insert({
        room_id: input.roomId,
        token_hash: hash,
        expires_at: input.expiresAt ?? null,
        max_uses: input.maxUses ?? null,
        uses_count: 0,
        revoked_at: null,
        created_by: user.id,
        created_at: now,
      })
      .select("id")
      .single();
    if (error) throw error;
    await audit(admin, {
      actor_user_id: user.id,
      target_user_id: null,
      room_id: input.roomId,
      session_id: null,
      action: "invite_created",
      metadata: { invite_id: data.id },
      created_at: now,
    });
    return NextResponse.json({ id: data.id, token }, { status: 201 });
  } catch (error) {
    return apiError(error, "invite_create_failed");
  }
}
