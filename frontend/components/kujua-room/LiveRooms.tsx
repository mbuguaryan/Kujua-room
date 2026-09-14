import type { ReactNode } from "react";
import type { LiveRoomSummary } from "@/types/room";
import type { LiveRoomsState } from "@/lib/room/live-rooms";

/**
 * The Live now list, shared by the landing page and /join. The two differ only
 * in what the button on each row does, so that is the one thing passed in.
 */
export function LiveRooms({
  rooms,
  state,
  action,
  headingId = "live-now-heading",
}: {
  rooms: LiveRoomSummary[];
  state: LiveRoomsState;
  action: (room: LiveRoomSummary) => ReactNode;
  headingId?: string;
}) {
  return (
    <section className="live-list" aria-labelledby={headingId}>
      <header className="live-list-head">
        <h2 id={headingId}>Live now</h2>
        {state === "ready" && rooms.length > 0 ? (
          <span className="live-count">
            <i className="live-dot" aria-hidden="true" />
            {rooms.length} {rooms.length === 1 ? "room" : "rooms"}
          </span>
        ) : null}
      </header>

      {state === "loading" ? (
        <div className="live-skeleton" role="status" aria-live="polite">
          <span className="sr-only">Loading live rooms…</span>
          <div className="skeleton-row" />
          <div className="skeleton-row" />
        </div>
      ) : state === "failed" ? (
        <div className="live-empty" role="alert">
          <strong>Can&apos;t load live rooms right now.</strong>
          <p>
            Check your connection and refresh. Invitation links still open
            private rooms directly.
          </p>
        </div>
      ) : rooms.length === 0 ? (
        <div className="live-empty">
          <strong>No public rooms are live.</strong>
          <p>
            When a host starts a public session it appears here. Invitation
            links still open private rooms directly.
          </p>
        </div>
      ) : (
        <ul className="live-rooms">
          {rooms.map((room) => (
            <li key={room.sessionId}>
              <article className="live-room">
                <div className="live-room-body">
                  <span className="live-badge">
                    <i className="live-dot" aria-hidden="true" />
                    Live
                  </span>
                  <strong>{room.name}</strong>
                  <p>{room.title}</p>
                  {room.description ? <small>{room.description}</small> : null}
                </div>
                {action(room)}
              </article>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
