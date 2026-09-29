import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
} from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { RoomReactions } from "@/components/kujua-room/RoomReactions";

afterEach(() => {
  cleanup();
  vi.useRealTimers();
});
function createMeeting(
  id: string,
  bus: Set<(event: { type: string; payload: Record<string, unknown> }) => void>,
) {
  const people = new Map([
    ["listener", { id: "listener", name: "Listener" }],
    ["host", { id: "host", name: "Admin" }],
  ]);
  return {
    self: people.get(id),
    participants: {
      joined: { get: (peer: string) => people.get(peer) },
      on: vi.fn((_event, handler) => bus.add(handler)),
      off: vi.fn((_event, handler) => bus.delete(handler)),
      broadcastMessage: vi.fn(async (type, payload) => {
        for (const handler of bus) handler({ type, payload });
      }),
    },
  } as unknown as NonNullable<Parameters<typeof RoomReactions>[0]["meeting"]>;
}

it("shares a listener reaction with both listener and admin, then removes it", async () => {
  vi.useFakeTimers();
  const bus = new Set<
    (event: { type: string; payload: Record<string, unknown> }) => void
  >();
  const listener = createMeeting("listener", bus);
  const host = createMeeting("host", bus);
  render(
    <>
      <RoomReactions meeting={listener} connected />
      <RoomReactions meeting={host} connected />
    </>,
  );
  fireEvent.click(
    screen.getAllByRole("button", { name: "Send a reaction" })[0],
  );
  await act(async () =>
    fireEvent.click(screen.getByRole("button", { name: "Applause" })),
  );
  expect(listener.participants.broadcastMessage).toHaveBeenCalledTimes(1);
  expect(screen.getAllByText("Listener")).toHaveLength(2);
  await act(async () => vi.advanceTimersByTime(4500));
  expect(screen.queryByText("Listener")).toBeNull();
});

it("lets admins react, supports Escape and does not show failed sends as delivered", async () => {
  const bus = new Set<
    (event: { type: string; payload: Record<string, unknown> }) => void
  >();
  const host = createMeeting("host", bus);
  vi.mocked(host.participants.broadcastMessage).mockRejectedValue(
    new Error("Offline"),
  );
  render(<RoomReactions meeting={host} connected />);
  const toggle = screen.getByRole("button", { name: "Send a reaction" });
  fireEvent.click(toggle);
  expect(screen.getByRole("button", { name: "Love" })).toHaveFocus();
  await act(async () =>
    fireEvent.click(screen.getByRole("button", { name: "Love" })),
  );
  expect(screen.getByRole("alert")).toHaveTextContent(
    "Reaction could not be sent",
  );
  expect(screen.queryByText("Admin")).toBeNull();
  fireEvent.keyDown(document, { key: "Escape" });
  expect(toggle).toHaveFocus();
  expect(screen.queryByRole("group", { name: "Choose a reaction" })).toBeNull();
});

it("ignores malformed, unknown-participant and duplicate reactions, and unsubscribes", () => {
  const bus = new Set<
    (event: { type: string; payload: Record<string, unknown> }) => void
  >();
  const host = createMeeting("host", bus);
  const view = render(<RoomReactions meeting={host} connected />);
  act(() => {
    for (const callback of bus) {
      callback({
        type: "KUJUA_REACTION",
        payload: { id: "1", emoji: "<img>", participantId: "listener" },
      });
      callback({
        type: "KUJUA_REACTION",
        payload: { id: "2", emoji: "👏", participantId: "stranger" },
      });
      const event = {
        type: "KUJUA_REACTION",
        payload: { id: "3", emoji: "👏", participantId: "listener" },
      };
      callback(event);
      callback(event);
    }
  });
  expect(screen.getAllByText("Listener")).toHaveLength(1);
  expect(screen.queryByText("<img>")).toBeNull();
  view.unmount();
  expect(bus.size).toBe(0);
});
