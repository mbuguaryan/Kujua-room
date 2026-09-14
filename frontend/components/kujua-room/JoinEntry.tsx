import { useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { useLiveRooms } from "@/lib/room/live-rooms";
import type { LiveRoomSummary } from "@/types/room";
import { LiveRooms } from "./LiveRooms";
import { SiteNav } from "./SiteNav";

/**
 * The audience's front door, mirroring /host/login on the other side.
 *
 * A name is the key here: RoomApp only shows the join form when the room URL
 * carries an invite token, the host flag, or a name. This screen is where a
 * listener who arrived without an invite gets one.
 */
export function JoinEntry() {
  const navigate = useNavigate();
  const [search] = useSearchParams();
  const { rooms, state } = useLiveRooms();
  const [name, setName] = useState("");

  const requestedSlug = search.get("room") ?? "";
  const trimmedName = name.trim();

  /* The room picked on the landing page goes to the top, so the choice already
     made is the first one on screen rather than something to hunt for. */
  const ordered = requestedSlug
    ? [...rooms].sort((a, b) =>
        a.slug === requestedSlug ? -1 : b.slug === requestedSlug ? 1 : 0,
      )
    : rooms;

  const requestedIsGone =
    state === "ready" &&
    Boolean(requestedSlug) &&
    !rooms.some((room) => room.slug === requestedSlug);

  function enter(room: LiveRoomSummary) {
    const query = new URLSearchParams();
    query.set("name", trimmedName);
    const invite = search.get("invite");
    if (invite) query.set("invite", invite);
    navigate(`/r/${room.slug}?${query}`);
  }

  return (
    <main className="landing">
      <SiteNav active="audience" />

      <div className="landing-body join-entry">
        <header className="join-entry-head">
          <span className="host-room-kicker">Audience</span>
          <h1>Join a room</h1>
          <p>
            Pick a live room and enter the name everyone in it will see. No
            account, no download.
          </p>
        </header>

        <div className="join-entry-name">
          <label className="form-label" htmlFor="audience-name">
            Your name
          </label>
          <input
            id="audience-name"
            className="form-input"
            value={name}
            maxLength={80}
            autoComplete="name"
            autoFocus
            placeholder="e.g. Marcus"
            aria-describedby="audience-name-hint"
            onChange={(event) => setName(event.target.value)}
          />
          <p className="field-hint" id="audience-name-hint">
            {trimmedName
              ? "Shown to everyone in the room."
              : "Needed before you can join a room."}
          </p>
        </div>

        {requestedIsGone ? (
          <p className="join-entry-note" role="status">
            That session has finished. Here is what else is live.
          </p>
        ) : null}

        <LiveRooms
          rooms={ordered}
          state={state}
          action={(room) => (
            <button
              className="btn small primary"
              disabled={!trimmedName}
              title={trimmedName ? undefined : "Enter your name to join"}
              onClick={() => enter(room)}
            >
              Join
            </button>
          )}
        />

        <p className="landing-aside">
          Have an invitation link? Open it directly — it works for private rooms
          that never appear here.
        </p>
      </div>
    </main>
  );
}
