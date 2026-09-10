import type { RealtimeKitStageStatus, RoomRole } from "@/types/room";

export function isLocalMicrophoneUnlocked(input: {
  connected: boolean;
  effectiveRole: RoomRole;
  stageStatus: RealtimeKitStageStatus;
  canEnableSelfAudio: boolean;
}) {
  if (!input.connected) return false;
  if (input.stageStatus === "ON_STAGE") return true;
  return input.effectiveRole !== "audience" && input.canEnableSelfAudio;
}

export function canAudienceRaiseHand(input: {
  effectiveRole: RoomRole;
  stageStatus: RealtimeKitStageStatus;
}) {
  return (
    input.effectiveRole === "audience" &&
    input.stageStatus !== "ON_STAGE" &&
    input.stageStatus !== "ACCEPTED_TO_JOIN_STAGE"
  );
}

export function isRemoteMicrophoneAvailable(input: {
  role: RoomRole;
  stageStatus?: RealtimeKitStageStatus;
}) {
  return input.role !== "audience" || input.stageStatus === "ON_STAGE";
}

export function hasRemoteSpeakingAccess(input: {
  currentRole?: RoomRole;
  stageStatus?: RealtimeKitStageStatus;
}) {
  return input.currentRole === "speaker" || input.stageStatus === "ON_STAGE";
}
