import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/database.types";
import type { RoomRole } from "@/types/room";
import { mediaAdapter } from "@/lib/media";
import { audit } from "@/lib/room/audit";

type Admin = SupabaseClient<Database>;
export async function changeSessionRole(input: {
  admin: Admin;
  actorUserId: string;
  targetUserId: string;
  sessionId: string;
  roomId: string;
  meetingId: string | null;
  nextRole: RoomRole;
  permanent?: boolean;
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
  if (providerParticipantId && input.meetingId) {
    await mediaAdapter().updateParticipantRole({
      meetingId: input.meetingId,
      participantId: providerParticipantId,
      role: input.nextRole,
    });
  }
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
  } catch (error) {
    await input.admin
      .from("session_participants")
      .update({ current_role: previousRole })
      .eq("session_id", input.sessionId)
      .eq("user_id", input.targetUserId);
    if (providerParticipantId && input.meetingId) {
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
  const now = new Date().toISOString();
  const action = `role_changed_to_${input.nextRole}`;
  const metadata = {
    previous_role: previousRole,
    permanent: Boolean(input.permanent),
  };
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
  return { previousRole, currentRole: input.nextRole };
}
