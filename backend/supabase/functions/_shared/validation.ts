import { z } from "npm:zod@4.5.4";

export const uuidSchema = z.string().uuid();
export const roomSlugSchema = z
  .string()
  .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/)
  .max(80);
export const displayNameSchema = z.string().trim().min(1).max(80);
export const inviteTokenSchema = z
  .string()
  .min(24)
  .max(256)
  .regex(/^[A-Za-z0-9_-]+$/);
export const roleSchema = z.enum(["host", "moderator", "speaker", "audience"]);
export const joinRoomSchema = z.object({
  slug: roomSlugSchema,
  inviteToken: inviteTokenSchema.optional(),
  displayName: displayNameSchema,
  requestHost: z.boolean().default(false),
  accessMode: z.enum(["public", "private"]).optional(),
});
export const sessionIdSchema = z.object({ sessionId: uuidSchema });
export const notesSchema = z.object({
  title: z.string().trim().min(1).max(160),
  body: z.string().trim().max(4000),
  points: z.array(z.string().trim().min(1).max(500)).max(30),
});
export const roleChangeSchema = z.object({
  role: roleSchema,
  permanent: z.boolean().default(false),
});
export const stageRequestSchema = z.object({
  action: z.enum(["raise", "cancel", "approve", "decline"]),
  requestId: uuidSchema.optional(),
  note: z.string().trim().max(500).optional(),
});
export const hostLoginSchema = z.object({
  email: z.string().email().max(320),
  password: z.string().min(8).max(200),
});
export const createRoomSchema = z.object({
  name: z.string().trim().min(1).max(120),
  description: z.string().trim().max(500).optional().default(""),
  accessMode: z.enum(["public", "private"]).default("private"),
});
export const startSessionSchema = z.object({
  title: z.string().trim().min(1).max(160),
  agenda: z.string().trim().max(4000).optional().default(""),
  goals: z.string().trim().max(4000).optional().default(""),
});
export const messageSchema = z.object({ recipientId: uuidSchema.nullable().optional(), message: z.string().trim().min(1).max(2000) });
