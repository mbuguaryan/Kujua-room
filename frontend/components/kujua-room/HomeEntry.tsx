import { Link, useSearchParams } from "react-router-dom";
import { useLiveRooms } from "@/lib/room/live-rooms";
import { LiveRooms } from "./LiveRooms";
import { SiteNav } from "./SiteNav";

/**
 * Three facts, each true of what is actually built — the raise-hand request,
 * the host's mute controls, and invite links that need no account. Borrowed
 * industry statistics would be neither checkable nor ours.
 */
const facts = [
  {
    label: "Open a link, you're in",
    path: "M20 6 9 17l-5-5",
  },
  {
    label: "Raise a hand to speak",
    path: "M18 11V6a2 2 0 0 0-4 0M14 10V4a2 2 0 0 0-4 0v9M10 9V6a2 2 0 0 0-4 0v8a8 8 0 0 0 16 0v-3",
  },
  {
    label: "The host controls every mic",
    path: "M9 2h6v11a3 3 0 0 1-6 0zM5 10a7 7 0 0 0 14 0M12 17v4",
  },
];

export function HomeEntry() {
  const { rooms, state } = useLiveRooms();
  const [search] = useSearchParams();

  /* An invite token on the landing page has to survive the trip to /join, or a
     listener who opened an invite link and then clicked through loses it. */
  function joinHref(slug?: string) {
    const query = new URLSearchParams();
    if (slug) query.set("room", slug);
    const invite = search.get("invite");
    if (invite) query.set("invite", invite);
    const suffix = query.toString();
    return suffix ? `/join?${suffix}` : "/join";
  }

  return (
    <main className="landing">
      <SiteNav />

      <header className="landing-hero">
        <div className="landing-hero-media" aria-hidden="true" />
        <div className="landing-hero-inner">
          <p className="hero-kicker">Voice-only coaching rooms</p>
          <h1>The room is voice only. That&apos;s the point.</h1>
          <p className="hero-lede">
            A coach and their people in one live audio room, with the agenda,
            private notes and chat right there. Nothing to install, and nobody
            has to be camera-ready.
          </p>
          <ul className="hero-facts">
            {facts.map((fact) => (
              <li key={fact.label}>
                <svg
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2.2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  aria-hidden="true"
                >
                  <path d={fact.path} />
                </svg>
                {fact.label}
              </li>
            ))}
          </ul>
        </div>
      </header>

      <div className="landing-body">
        <LiveRooms
          rooms={rooms}
          state={state}
          action={(room) => (
            <Link className="btn small primary" to={joinHref(room.slug)}>
              Join
            </Link>
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
