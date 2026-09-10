import { useEffect, useState } from "react";
import { useNavigate, useSearchParams, Link } from "react-router-dom";
import { apiFetch } from "@/lib/api";
import type { LiveRoomSummary } from "@/types/room";

type LoadState = "loading" | "ready" | "failed";

export function HomeEntry() {
  const [rooms, setRooms] = useState<LiveRoomSummary[]>([]);
  const [loadState, setLoadState] = useState<LoadState>("loading");
  const [name, setName] = useState("");
  const [hostAccess, setHostAccess] = useState<"public" | "private">("private");
  const navigate = useNavigate();
  const [search] = useSearchParams();

  useEffect(() => {
    let cancelled = false;
    void apiFetch("/rooms/live", { cache: "no-store" })
      .then(async (response) => {
        if (!response.ok) throw new Error("unavailable");
        return (await response.json()) as { rooms?: LiveRoomSummary[] };
      })
      .then((body) => {
        if (cancelled) return;
        setRooms(body.rooms ?? []);
        setLoadState("ready");
      })
      .catch(() => {
        if (!cancelled) setLoadState("failed");
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const trimmedName = name.trim();

  function enter(slug: string) {
    const query = new URLSearchParams();
    query.set("name", trimmedName);
    const invite = search.get("invite");
    if (invite) query.set("invite", invite);
    navigate(`/r/${slug}?${query}`);
  }

  return (
    <main className="home-screen">
      <section className="home-hero">
        <div className="brand-mark">K</div>
        <h1>Kujua Room</h1>
        <p>Join a live conversation or enter as the room host.</p>

        <div className="entry-grid">
          <div className="entry-card">
            <strong>Host</strong>
            <span>
              Create rooms and start sessions with their own titles, agendas and
              goals.
            </span>

            <span className="field-label" id="visibility-label">
              Default room visibility
            </span>
            <div
              className="host-access-choice"
              role="radiogroup"
              aria-labelledby="visibility-label"
            >
              <button
                type="button"
                role="radio"
                aria-checked={hostAccess === "public"}
                className={hostAccess === "public" ? "active" : ""}
                onClick={() => setHostAccess("public")}
              >
                <b>Public</b>
                <small>Live sessions can appear under Live now.</small>
              </button>
              <button
                type="button"
                role="radio"
                aria-checked={hostAccess === "private"}
                className={hostAccess === "private" ? "active" : ""}
                onClick={() => setHostAccess("private")}
              >
                <b>Private</b>
                <small>Only people with the room or invite link can join.</small>
              </button>
            </div>

            <Link className="btn primary" to={`/host/login?access=${hostAccess}`}>
              Continue as host
            </Link>
          </div>

          <div className="entry-card">
            <strong>Audience</strong>
            <span>Enter your name, then choose a room from Live now.</span>

            <label className="field-label" htmlFor="audience-name">
              Your name
            </label>
            <input
              id="audience-name"
              className="form-input"
              value={name}
              maxLength={80}
              autoComplete="name"
              placeholder="e.g. Marcus"
              aria-describedby="audience-name-hint"
              onChange={(event) => setName(event.target.value)}
            />
            <p className="field-hint" id="audience-name-hint">
              {trimmedName
                ? "Shown to everyone in the room."
                : "Needed before you can join a room."}
            </p>

            <p className="entry-aside">
              Have an invitation link? Open it directly — it works for private
              rooms that never appear here.
            </p>
          </div>
        </div>

        <section className="live-list" aria-labelledby="live-now-heading">
          <header className="live-list-head">
            <h2 id="live-now-heading">Live now</h2>
            {loadState === "ready" && rooms.length > 0 ? (
              <span className="live-count">
                <i className="live-dot" aria-hidden="true" />
                {rooms.length} {rooms.length === 1 ? "room" : "rooms"}
              </span>
            ) : null}
          </header>

          {loadState === "loading" ? (
            <div className="live-skeleton" role="status" aria-live="polite">
              <span className="sr-only">Loading live rooms…</span>
              <div className="skeleton-row" />
              <div className="skeleton-row" />
            </div>
          ) : loadState === "failed" ? (
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
                    <button
                      className="btn small primary"
                      disabled={!trimmedName}
                      title={
                        trimmedName ? undefined : "Enter your name to join"
                      }
                      onClick={() => enter(room.slug)}
                    >
                      Join
                    </button>
                  </article>
                </li>
              ))}
            </ul>
          )}
        </section>
      </section>
    </main>
  );
}
