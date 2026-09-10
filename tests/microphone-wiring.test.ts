// @vitest-environment node

import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const roomScreen = readFileSync(
  resolve(process.cwd(), "components/kujua-room/RoomScreen.tsx"),
  "utf8",
);
const realtimeKitHook = readFileSync(
  resolve(process.cwd(), "hooks/useRealtimeKit.ts"),
  "utf8",
);
const stageRoute = readFileSync(
  resolve(process.cwd(), "supabase/functions/sessions/stage.ts"),
  "utf8",
);

describe("microphone wiring", () => {
  it("keeps microphone and hand actions separate", () => {
    expect(roomScreen).toContain("toggleSelfMicrophone");
    expect(roomScreen).toContain("toggleHand");
    expect(roomScreen).not.toContain("requestToSpeakFromMic");
  });

  it("uses provider user IDs for stage operations", () => {
    expect(realtimeKitHook).toContain("grantAccess([participant.userId])");
    expect(realtimeKitHook).toContain("denyAccess([participant.userId])");
    expect(realtimeKitHook).toContain("kick([participant.userId])");
    expect(realtimeKitHook).not.toContain("grantAccess([participant.id])");
    expect(realtimeKitHook).not.toContain("denyAccess([participant.id])");
  });

  it("requires real provider speaking access before enabling audio", () => {
    expect(realtimeKitHook).toContain("canEnableSelfAudio");
    expect(realtimeKitHook).toContain('currentStage === "ON_STAGE"');
    expect(realtimeKitHook).toContain('providerPermission === "ALLOWED"');
  });

  it("keeps temporary speaking access in RealtimeKit instead of the database role", () => {
    expect(stageRoute).not.toContain("changeSessionRole");
    expect(stageRoute).toContain("RealtimeKit owns temporary speaking state");
    expect(roomScreen).not.toContain("joinApprovedStage");
  });
});
