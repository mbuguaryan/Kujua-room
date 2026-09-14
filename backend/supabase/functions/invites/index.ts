import { randomBytes, createHash } from "node:crypto";
import { z } from "npm:zod@4.5.4";
import { Router } from "../_shared/router.ts";
import { json, apiError } from "../_shared/http.ts";
import { HttpError, requireMembership } from "../_shared/auth.ts";
import { createAdminClient } from "../_shared/supabase.ts";
import { rateLimit } from "../_shared/rate-limit.ts";
import { audit } from "../_shared/audit.ts";
import { uuidSchema } from "../_shared/validation.ts";

const createSchema = z.object({
  roomId: uuidSchema,
  expiresAt: z.string().datetime().optional(),
  maxUses: z.number().int().positive().max(5000).optional(),
});

const revokeSchema = z.object({ inviteId: uuidSchema });

const router = new Router("invites");

/* ── POST /invites/create ────────────────────────────────────────────────── */
router.post("/create", async (request) => {
  try {
    const input = createSchema.parse(await request.json());
    const { user } = await requireMembership(request, input.roomId, ["host"]);
    await rateLimit("invite-create", user.id, 20, 3600);

    // Only the hash is stored; the plaintext token is returned once and never
    // persisted. redeem_room_invite_server hashes the presented token the same
    // way, so this must stay byte-identical to the Node implementation.
    const token = randomBytes(32).toString("base64url");
    const hash = createHash("sha256").update(token).digest("hex");

    const admin = createAdminClient();
    const now = new Date().toISOString();
    const { data, error } = await admin
      .from("room_invites")
      .insert({
        room_id: input.roomId, token_hash: hash,
        expires_at: input.expiresAt ?? null,
        max_uses: input.maxUses ?? null,
        uses_count: 0, revoked_at: null,
        created_by: user.id, created_at: now,
      })
      .select("id").single();
    if (error) throw error;
    await audit(admin, {
      actor_user_id: user.id, target_user_id: null,
      room_id: input.roomId, session_id: null,
      action: "invite_created", metadata: { invite_id: data.id },
      created_at: now,
    });
    return json(request, { id: data.id, token }, { status: 201 });
  } catch (error) {
    return apiError(request, error, "invite_create_failed");
  }
});

/* ── POST /invites/revoke ────────────────────────────────────────────────── */
router.post("/revoke", async (request) => {
  try {
    const { inviteId } = revokeSchema.parse(await request.json());
    const admin = createAdminClient();
    const { data: invite } = await admin
      .from("room_invites").select("id,room_id").eq("id", inviteId).maybeSingle();
    if (!invite) throw new HttpError(404, "Invitation not found");
    const { user } = await requireMembership(request, invite.room_id, ["host"]);
    const now = new Date().toISOString();
    await admin.from("room_invites").update({ revoked_at: now }).eq("id", inviteId);
    await audit(admin, {
      actor_user_id: user.id, target_user_id: null,
      room_id: invite.room_id, session_id: null,
      action: "invite_revoked", metadata: { invite_id: inviteId },
      created_at: now,
    });
    return json(request, { ok: true });
  } catch (error) {
    return apiError(request, error, "invite_revoke_failed");
  }
});

Deno.serve((request) => router.handle(request));
