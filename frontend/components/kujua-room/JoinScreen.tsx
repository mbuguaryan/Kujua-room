import { useState } from "react";
import { MicrophoneSetup } from "./MicrophoneSetup";
import { BrandMark } from "./BrandMark";

/** "mens-conference" -> "Mens Conference", used until the server sends the real name. */
function humanizeSlug(slug: string) {
  return slug
    .split("-")
    .filter(Boolean)
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(" ");
}

export function JoinScreen({
  roomSlug,
  inviteValid,
  initialName = "",
  loading,
  message,
  onJoin,
}: {
  roomSlug: string;
  inviteValid: boolean;
  initialName?: string;
  loading: boolean;
  message: string;
  onJoin: (name: string, deviceId?: string) => Promise<void>;
}) {
  const [name, setName] = useState(initialName);
  const [deviceId, setDeviceId] = useState<string>();
  const canJoin = !loading && Boolean(name.trim());

  return (
    <main className="join-screen">
      <section className="join-card" aria-labelledby="join-title">
        <div className="brand-center">
          <BrandMark className="lg" />
        </div>
        <h1 id="join-title">Kujua Room</h1>
        <p className="sub">
          Coaching with Keith Muoki ·{" "}
          <a
            href="https://wa.me/254705960183"
            target="_blank"
            rel="noopener noreferrer"
            aria-label="Message Keith Muoki on WhatsApp"
          >
            WhatsApp
          </a>
        </p>

        <div className="session-preview">
          <span>Room</span>
          {/* Was hardcoded to "Men's Conference", so every other room showed the
              wrong name. The real name only arrives after joining, so derive a
              readable one from the slug in the meantime. */}
          <h2>{humanizeSlug(roomSlug)}</h2>
          <p>Enter your name below to join the live audio room.</p>
        </div>

        {inviteValid ? (
          <>
            <label className="form-label" htmlFor="display-name">
              Your name
            </label>
            <input
              id="display-name"
              className="form-input"
              value={name}
              maxLength={90}
              autoComplete="name"
              placeholder="e.g. Marcus"
              onChange={(event) => setName(event.target.value)}
              disabled={loading}
            />
            <MicrophoneSetup
              selectedDeviceId={deviceId}
              onDeviceChange={setDeviceId}
            />
            <button
              className="btn primary"
              disabled={!canJoin}
              title={name.trim() ? undefined : "Enter your name to join"}
              onClick={() => onJoin(name, deviceId)}
            >
              {loading ? (
                <>
                  <i className="btn-spinner" aria-hidden="true" />
                  {message}
                </>
              ) : (
                "Join call"
              )}
            </button>
          </>
        ) : (
          <div className="error-state" role="alert">
            <h2>Invitation required</h2>
            <p>Ask your host for a valid Kujua Room invitation link.</p>
          </div>
        )}

        <p className="join-status" aria-live="polite">
          {loading
            ? message
            : "Your microphone is used only during the live room."}
        </p>
      </section>
    </main>
  );
}
