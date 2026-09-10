import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/database.types.ts";
import type { RoomRole } from "@/types/room.ts";
import { mediaAdapter } from "./media/index.ts";
import { audit } from "./audit.ts";

type Admin = SupabaseClient<Database>;
type ModerationRoleAction =
  | "promote_moderator"
  | "demote_moderator"
  | "promote_speaker"
  | "demote_speaker";

function moderationRoleAction(
  previousRole: RoomRole,
  nextRole: RoomRole,
): ModerationRoleAction | null {
  if (previousRole === nextRole) return null;
  if (nextRole === "moderator") return "promote_moderator";
  if (previousRole === "moderator") return "demote_moderator";
  if (nextRole === "speaker") return "promote_speaker";
  if (previousRole === "speaker") return "demote_speaker";
  return null;
}

export async function changeSessionRole(input: {
  admin: Admin;
  actorUserId: string;
  targetUserId: string;
  sessionId: string;
  roomId: string;
  meetingId: string | null;
  nextRole: RoomRole;
  permanent?: boolean;
  syncProviderRole?: boolean;
}) {
  const { data: attendance, error: attendanceError } = await input.admin
    .from("session_participants")
    .select("current_role")
    .eq("session_id", input.sessionId)
    .eq("user_id", input.targetUserId)
    .single();
  if (attendanceError) throw attendanceError;
  const previousRole = attendance.current_role;
  const { data: media } = await input.admin
    .from("media_participants")
    .select("provider_participant_id")
    .eq("session_id", input.sessionId)
    .eq("user_id", input.targetUserId)
    .maybeSingle();
  const providerParticipantId = media?.provider_participant_id;
  const shouldSyncProviderRole = input.syncProviderRole !== false;

  // Temporary stage promotion is handled by RealtimeKit's live Stage API on
  // the host client. Do not PATCH the participant preset while they are in the
  // meeting: that is a different operation and was causing stage approval to
  // fail with a 500. Permanent/admin role changes can still sync the preset.
  if (shouldSyncProviderRole && providerParticipantId && input.meetingId) {
    await mediaAdapter().updateParticipantRole({
      meetingId: input.meetingId,
      participantId: providerParticipantId,
      role: input.nextRole,
    });
  }

  const now = new Date().toISOString();
  const action = moderationRoleAction(previousRole, input.nextRole);
  const metadata = {
    previous_role: previousRole,
    permanent: Boolean(input.permanent),
    provider_role_synced: shouldSyncProviderRole,
  };

  try {
    const { error } = await input.admin
      .from("session_participants")
      .update({ current_role: input.nextRole })
      .eq("session_id", input.sessionId)
      .eq("user_id", input.targetUserId);
    if (error) throw error;

    if (input.permanent) {
      const { error: memberError } = await input.admin
        .from("room_members")
        .update({ role: input.nextRole })
        .eq("room_id", input.roomId)
        .eq("user_id", input.targetUserId);
      if (memberError) throw memberError;
    }

    if (action) {
      const { error: eventError } = await input.admin
        .from("moderation_events")
        .insert({
          actor_user_id: input.actorUserId,
          target_user_id: input.targetUserId,
          session_id: input.sessionId,
          action,
          metadata,
          created_at: now,
        });
      if (eventError) throw eventError;

      await audit(input.admin, {
        actor_user_id: input.actorUserId,
        target_user_id: input.targetUserId,
        room_id: input.roomId,
        session_id: input.sessionId,
        action,
        metadata,
        created_at: now,
      });
    }
  } catch (error) {
    await input.admin
      .from("session_participants")
      .update({ current_role: previousRole })
      .eq("session_id", input.sessionId)
      .eq("user_id", input.targetUserId);

    if (input.permanent) {
      await input.admin
        .from("room_members")
        .update({ role: previousRole })
        .eq("room_id", input.roomId)
        .eq("user_id", input.targetUserId);
    }

    if (shouldSyncProviderRole && providerParticipantId && input.meetingId) {
      await mediaAdapter()
        .updateParticipantRole({
          meetingId: input.meetingId,
          participantId: providerParticipantId,
          role: previousRole,
        })
        .catch(() => undefined);
    }
    throw error;
  }

  return { previousRole, currentRole: input.nextRole };
}
