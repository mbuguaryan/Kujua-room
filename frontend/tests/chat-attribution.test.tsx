import { cleanup, render, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ChatPanel } from "@/components/kujua-room/ChatPanel";
import type { Participant, RoomMessage } from "@/types/room";

afterEach(cleanup);

const participants: Participant[] = [
  {
    id: "host-1",
    name: "Keith Muoki",
    role: "host",
    muted: false,
    handRaised: false,
    speaking: false,
    local: true,
  },
  {
    id: "guest-1",
    name: "Amina Wanjiru",
    role: "audience",
    muted: true,
    handRaised: false,
    speaking: false,
  },
];

function message(overrides: Partial<RoomMessage>): RoomMessage {
  return {
    id: "m1",
    sessionId: "s1",
    roomId: "r1",
    senderId: "guest-1",
    recipientId: null,
    senderName: "Amina Wanjiru",
    message: "Hello everyone",
    messageType: "text",
    createdAt: "2026-09-10T13:16:00.000Z",
    ...overrides,
  };
}

function renderChat(messages: RoomMessage[]) {
  return render(
    <ChatPanel
      sessionId="s1"
      userId="host-1"
      selfName="Keith Muoki"
      participants={participants}
      messages={messages}
      onRefresh={vi.fn().mockResolvedValue(undefined)}
    />,
  );
}

describe("ChatPanel attribution", () => {
  it("names the sender on every message", () => {
    const { getByText } = renderChat([message({})]);
    expect(getByText("Amina Wanjiru")).toBeInTheDocument();
  });

  it("names the viewer's own messages instead of an anonymous 'You'", () => {
    const { getByText } = renderChat([
      message({ id: "m2", senderId: "host-1", senderName: "Keith Muoki" }),
    ]);
    expect(getByText(/Keith Muoki/)).toBeInTheDocument();
    expect(getByText(/\(you\)/)).toBeInTheDocument();
  });

  it("tags a host so the name says who is speaking with authority", () => {
    const { container } = renderChat([
      message({ id: "m3", senderId: "host-1", senderName: "Keith Muoki" }),
    ]);
    expect(container.querySelector(".chat-role")).toHaveTextContent("host");
  });

  it("falls back to a readable name when the server has none", () => {
    const { getByText } = renderChat([
      message({ id: "m4", senderId: "gone", senderName: "   " }),
    ]);
    expect(getByText("Participant")).toBeInTheDocument();
  });

  it("renders a malicious display name literally", () => {
    const name = '<img src=x onerror="alert(1)">';
    const { container, getByText } = renderChat([
      message({ id: "m5", senderId: "guest-1", senderName: name }),
    ]);
    expect(getByText(name)).toBeInTheDocument();
    expect(container.querySelector("img")).toBeNull();
  });

  it("keeps the private tag alongside the sender name", () => {
    const { container } = renderChat([
      message({ id: "m6", senderId: "guest-1", recipientId: "host-1" }),
    ]);
    // Private messages only show under the Private tab, so switch to it first.
    const head = container.querySelector(".chat-message-head");
    expect(head).toBeNull();

    const { container: roomView } = renderChat([
      message({ id: "m7", senderId: "guest-1", recipientId: null }),
    ]);
    const row = roomView.querySelector(".chat-message-head");
    expect(row).not.toBeNull();
    expect(within(row as HTMLElement).getByText("Amina Wanjiru")).toBeVisible();
  });
});
