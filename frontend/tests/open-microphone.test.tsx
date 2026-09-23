import { act, cleanup, renderHook } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
const sdk = vi.hoisted(() => ({ meeting: null as unknown, init: vi.fn() }));
vi.mock("@cloudflare/realtimekit-react", () => ({
  useRealtimeKitClient: () => [sdk.meeting, sdk.init],
}));
import { useKujuaRealtimeKit } from "@/hooks/useRealtimeKit";
afterEach(cleanup);
function meeting() {
  const events = { on: vi.fn(), off: vi.fn() };
  const self = {
    ...events,
    id: "self",
    name: "Guest",
    roomJoined: true,
    audioEnabled: false,
    permissions: { canProduceAudio: "ALLOWED" },
    stageStatus: "OFF_STAGE",
    enableAudio: vi.fn(async () => {
      self.audioEnabled = true;
    }),
    disableAudio: vi.fn(async () => {
      self.audioEnabled = false;
    }),
    disableVideo: vi.fn(),
  };
  const client = {
    self,
    stage: { ...events, status: "OFF_STAGE", requestAccess: vi.fn() },
    participants: { ...events, joined: { ...events, values: () => [] } },
    meta: events,
    join: vi.fn(),
    leave: vi.fn(async () => {}),
  };
  sdk.meeting = client;
  sdk.init.mockResolvedValue(client);
  return client;
}
it.each(["audience", "speaker", "moderator", "host"] as const)(
  "lets an off-stage %s unmute and mute without asking the host",
  async (role) => {
    const client = meeting();
    const { result } = renderHook(() => useKujuaRealtimeKit(role, "Guest"));
    await act(async () => result.current.toggleAudio());
    expect(client.self.enableAudio).toHaveBeenCalledOnce();
    expect(client.stage.requestAccess).not.toHaveBeenCalled();
    expect(
      result.current.participants.find((person) => person.local)?.muted,
    ).toBe(false);
    await act(async () => result.current.toggleAudio());
    expect(client.self.disableAudio).toHaveBeenCalledOnce();
    expect(
      result.current.participants.find((person) => person.local)?.muted,
    ).toBe(true);
  },
);
it("lets a participant unmute again after the host mutes them", async () => {
  const client = meeting();
  const { result } = renderHook(() => useKujuaRealtimeKit("audience", "Guest"));
  await act(async () => result.current.toggleAudio());
  // A remote mute updates the SDK's local audio state.
  await act(async () => client.self.disableAudio());
  await act(async () => result.current.toggleAudio());
  expect(client.self.enableAudio).toHaveBeenCalledTimes(2);
  expect(client.stage.requestAccess).not.toHaveBeenCalled();
  expect(
    result.current.participants.find((person) => person.local)?.muted,
  ).toBe(false);
});
it("always allows muting an active microphone even if audio permission changes", async () => {
  const client = meeting();
  client.self.audioEnabled = true;
  client.self.permissions.canProduceAudio = "NOT_ALLOWED";
  const { result } = renderHook(() => useKujuaRealtimeKit("audience", "Guest"));
  await act(async () => result.current.toggleAudio());
  expect(client.self.disableAudio).toHaveBeenCalledOnce();
  expect(client.self.audioEnabled).toBe(false);
});
it.each(["host", "audience"] as const)(
  "starts %s muted until they choose to speak",
  async (role) => {
    const client = meeting();
    client.self.roomJoined = false;
    const { result } = renderHook(() => useKujuaRealtimeKit(role, "User"));
    await act(async () => result.current.connect("provider-token"));
    expect(sdk.init).toHaveBeenLastCalledWith({
      authToken: "provider-token",
      defaults: { audio: false, video: false },
    });
    expect(client.self.disableAudio).toHaveBeenCalledOnce();
    expect(client.self.enableAudio).not.toHaveBeenCalled();
  },
);
