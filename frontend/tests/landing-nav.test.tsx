import { cleanup, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { HomeEntry } from "@/components/kujua-room/HomeEntry";
import { JoinEntry } from "@/components/kujua-room/JoinEntry";
import type { LiveRoomSummary } from "@/types/room";

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

const liveRoom: LiveRoomSummary = {
  id: "room-1",
  slug: "monday-reset",
  name: "Wanjiru Kamau",
  description: "Bring one thing you're stuck on.",
  sessionId: "session-1",
  title: "Monday reset",
  startedAt: null,
};

function mockLiveRooms(rooms: LiveRoomSummary[]) {
  vi.spyOn(globalThis, "fetch").mockResolvedValue(
    new Response(JSON.stringify({ rooms }), {
      status: 200,
      headers: { "content-type": "application/json" },
    }),
  );
}

/** Renders the real routes so the nav links and Join links are followed. */
function renderAt(path: string) {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route path="/" element={<HomeEntry />} />
        <Route path="/join" element={<JoinEntry />} />
        <Route path="/host/login" element={<h1>Host sign in</h1>} />
        <Route path="/r/:slug" element={<RoomProbe />} />
      </Routes>
    </MemoryRouter>,
  );
}

function RoomProbe() {
  return <h1>room reached</h1>;
}

describe("landing page", () => {
  beforeEach(() => mockLiveRooms([liveRoom]));

  it("offers both doors in the nav", async () => {
    renderAt("/");
    const nav = screen.getByRole("navigation", { name: "Main" });
    expect(within(nav).getByRole("link", { name: "Host" })).toHaveAttribute(
      "href",
      "/host/login",
    );
    expect(within(nav).getByRole("link", { name: "Audience" })).toHaveAttribute(
      "href",
      "/join",
    );
  });

  it("sends Host to the sign-in page", async () => {
    renderAt("/");
    await userEvent.click(screen.getByRole("link", { name: "Host" }));
    expect(
      screen.getByRole("heading", { name: "Host sign in" }),
    ).toBeInTheDocument();
  });

  it("keeps the hero above the live rooms it introduces", async () => {
    renderAt("/");
    expect(
      screen.getByRole("heading", {
        name: /the room is voice only/i,
        level: 1,
      }),
    ).toBeInTheDocument();
    await screen.findByText("Monday reset");
  });

  it("routes a live room's Join through /join carrying the slug", async () => {
    renderAt("/");
    const join = await screen.findByRole("link", { name: "Join" });
    expect(join).toHaveAttribute("href", "/join?room=monday-reset");
  });

  it("carries an invite token through to /join", async () => {
    renderAt("/?invite=tok-123");
    const join = await screen.findByRole("link", { name: "Join" });
    expect(join).toHaveAttribute("href", "/join?room=monday-reset&invite=tok-123");
  });
});

describe("/join", () => {
  it("will not let anyone join before they have a name", async () => {
    mockLiveRooms([liveRoom]);
    renderAt("/join");
    expect(await screen.findByRole("button", { name: "Join" })).toBeDisabled();
  });

  it("enters the room with the name once one is given", async () => {
    mockLiveRooms([liveRoom]);
    renderAt("/join?room=monday-reset");

    await userEvent.type(screen.getByLabelText("Your name"), "Marcus");
    await userEvent.click(await screen.findByRole("button", { name: "Join" }));

    expect(
      screen.getByRole("heading", { name: "room reached" }),
    ).toBeInTheDocument();
  });

  it("puts the room chosen on the landing page first", async () => {
    mockLiveRooms([
      { ...liveRoom, slug: "other", sessionId: "session-2", title: "Other room" },
      liveRoom,
    ]);
    renderAt("/join?room=monday-reset");

    const titles = await screen.findAllByRole("listitem");
    expect(within(titles[0]).getByText("Monday reset")).toBeInTheDocument();
  });

  it("says so when the chosen session has already finished", async () => {
    mockLiveRooms([]);
    renderAt("/join?room=monday-reset");
    await waitFor(() =>
      expect(screen.getByRole("status")).toHaveTextContent(
        /that session has finished/i,
      ),
    );
  });

  it("reports a failed lookup instead of showing an empty list", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response("nope", { status: 500 }),
    );
    renderAt("/join");
    expect(await screen.findByRole("alert")).toHaveTextContent(
      /can't load live rooms/i,
    );
  });
});
