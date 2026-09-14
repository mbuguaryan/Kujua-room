import { beforeEach, describe, expect, it, vi } from "vitest";
import { clearRecoveryState, readRecoveryState, saveRecoveryState } from "@/lib/room/recovery";

describe("room recovery state", () => {
  beforeEach(() => { sessionStorage.clear(); vi.restoreAllMocks(); });

  it("stores only safe room identifiers", () => {
    saveRecoveryState({ roomSlug: "mens-conference", sessionId: "11111111-1111-4111-8111-111111111111", clientInstanceId: "22222222-2222-4222-8222-222222222222" });
    const serialized = sessionStorage.getItem("kujua-room:recovery") ?? "";
    expect(serialized).not.toContain("token");
    expect(serialized).not.toContain("password");
    expect(readRecoveryState("mens-conference")?.sessionId).toBe("11111111-1111-4111-8111-111111111111");
  });

  it("rejects another room and clears explicit leave state", () => {
    saveRecoveryState({ roomSlug: "mens-conference", sessionId: "11111111-1111-4111-8111-111111111111", clientInstanceId: "22222222-2222-4222-8222-222222222222" });
    expect(readRecoveryState("another-room")).toBeNull();
    clearRecoveryState();
    expect(readRecoveryState("mens-conference")).toBeNull();
  });
});
