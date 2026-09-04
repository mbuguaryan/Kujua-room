import { describe, expect, it } from "vitest";
import {
  canAudienceRaiseHand,
  hasRemoteSpeakingAccess,
  isLocalMicrophoneUnlocked,
  isRemoteMicrophoneAvailable,
} from "@/lib/room/microphone-state";

describe("microphone state", () => {
  it("does not unlock an audience microphone merely because the database role says speaker", () => {
    expect(
      isLocalMicrophoneUnlocked({
        connected: true,
        effectiveRole: "speaker",
        stageStatus: "OFF_STAGE",
        canEnableSelfAudio: false,
      }),
    ).toBe(false);
  });

  it("unlocks the microphone once RealtimeKit confirms the participant is on stage", () => {
    expect(
      isLocalMicrophoneUnlocked({
        connected: true,
        effectiveRole: "speaker",
        stageStatus: "ON_STAGE",
        canEnableSelfAudio: true,
      }),
    ).toBe(true);
  });

  it("keeps hand raising separate from microphone state", () => {
    expect(
      canAudienceRaiseHand({
        effectiveRole: "audience",
        stageStatus: "OFF_STAGE",
      }),
    ).toBe(true);
    expect(
      isLocalMicrophoneUnlocked({
        connected: true,
        effectiveRole: "audience",
        stageStatus: "OFF_STAGE",
        canEnableSelfAudio: false,
      }),
    ).toBe(false);
  });

  it("stops offering a hand request after provider approval is accepted", () => {
    expect(
      canAudienceRaiseHand({
        effectiveRole: "audience",
        stageStatus: "ACCEPTED_TO_JOIN_STAGE",
      }),
    ).toBe(false);
  });

  it("does not expose host microphone controls for an off-stage audience member", () => {
    expect(
      isRemoteMicrophoneAvailable({
        role: "audience",
        stageStatus: "OFF_STAGE",
      }),
    ).toBe(false);
    expect(
      isRemoteMicrophoneAvailable({
        role: "audience",
        stageStatus: "ON_STAGE",
      }),
    ).toBe(true);
  });

  it("recognizes a temporary on-stage audience preset as revocable speaking access", () => {
    expect(
      hasRemoteSpeakingAccess({
        currentRole: "audience",
        stageStatus: "ON_STAGE",
      }),
    ).toBe(true);
  });
});
