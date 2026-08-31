"use client";
import { useCallback, useEffect, useState } from "react";
import type { RoomBootstrap, SessionNotes } from "@/types/room";
import { ParticipantTile } from "./ParticipantTile";
import { ParticipantsPanel } from "./ParticipantsPanel";
import { SessionNotesPanel } from "./SessionNotesPanel";
import { PrivateNotesPanel } from "./PrivateNotesPanel";
import { EndSessionOverlay } from "./EndSessionOverlay";
import { usePrivateNotes } from "@/hooks/usePrivateNotes";
import { useKujuaRealtimeKit } from "@/hooks/useRealtimeKit";
import { createClient } from "@/lib/supabase/client";
import { useRouter } from "next/navigation";
export function RoomScreen({
  bootstrap,
  deviceId,
}: {
  bootstrap: RoomBootstrap;
  deviceId?: string;
}) {
  const [panel, setPanel] = useState<
    "participants" | "notes" | "private" | null
  >(null);
  const [notes, setNotes] = useState<SessionNotes>(bootstrap.notes);
  const [endsAt, setEndsAt] = useState(bootstrap.session.endsAt);
  const media = useKujuaRealtimeKit(
    bootstrap.member.role,
    bootstrap.member.displayName,
  );
  const connectMedia = media.connect;
  const router = useRouter();
  const privateNotes = usePrivateNotes(
    bootstrap.session.id,
    bootstrap.member.userId,
  );
  useEffect(() => {
    void fetch(`/api/sessions/${bootstrap.session.id}/join`, { method: "POST" })
      .then(async (r) => {
        if (!r.ok) throw new Error("join failed");
        return fetch(`/api/sessions/${bootstrap.session.id}/media-token`, {
          method: "POST",
        });
      })
      .then((r) => r.json())
      .then((token: { authToken: string }) =>
        connectMedia(token.authToken, deviceId),
      );
  }, [bootstrap.session.id, connectMedia, deviceId]);
  useEffect(() => {
    const supabase = createClient();
    const channel = supabase
      .channel(`session-db-${bootstrap.session.id}`)
      .on(
        "postgres_changes",
        {
          event: "UPDATE",
          schema: "public",
          table: "sessions",
          filter: `id=eq.${bootstrap.session.id}`,
        },
        ({ new: row }) =>
          setEndsAt(typeof row.ends_at === "string" ? row.ends_at : null),
      )
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "session_notes",
          filter: `session_id=eq.${bootstrap.session.id}`,
        },
        ({ new: value }) => {
          const row = value as Record<string, unknown>;
          setNotes({
            title: String(row.title ?? "Today’s discussion"),
            body: String(row.body ?? ""),
            points: Array.isArray(row.points) ? row.points.map(String) : [],
            updatedAt: String(row.updated_at ?? ""),
          });
        },
      )
      .subscribe();
    return () => {
      void supabase.removeChannel(channel);
    };
  }, [bootstrap.session.id]);
  const leave = useCallback(async () => {
    await media.leave();
    await fetch(`/api/sessions/${bootstrap.session.id}/leave`, {
      method: "POST",
      keepalive: true,
    });
    router.push(`/r/${bootstrap.room.slug}`);
  }, [bootstrap.room.slug, bootstrap.session.id, media, router]);
  useEffect(() => {
    const key = (event: KeyboardEvent) => {
      const tag = (event.target as HTMLElement).tagName;
      if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return;
      if (
        event.key.toLowerCase() === "m" &&
        bootstrap.member.role !== "audience"
      )
        void media.toggleAudio();
      if (event.key.toLowerCase() === "h")
        void fetch(`/api/sessions/${bootstrap.session.id}/stage`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ action: "raise" }),
        });
    };
    document.addEventListener("keydown", key);
    return () => document.removeEventListener("keydown", key);
  }, [bootstrap.member.role, bootstrap.session.id, media]);
  useEffect(() => {
    let lock: WakeLockSentinel | null = null;
    const acquire = async () => {
      try {
        if ("wakeLock" in navigator && document.visibilityState === "visible")
          lock = await navigator.wakeLock.request("screen");
      } catch {}
    };
    void acquire();
    const visible = () => {
      if (document.visibilityState === "visible") void acquire();
    };
    document.addEventListener("visibilitychange", visible);
    return () => {
      document.removeEventListener("visibilitychange", visible);
      void lock?.release();
    };
  }, []);
  return (
    <main className="call-screen">
      <header className="call-header">
        <div>
          <span className={`status-dot ${media.connected ? "" : "waiting"}`} />
          <span>
            Room: <b>{bootstrap.room.name}</b>
          </span>
          <small>
            {media.connected
              ? "Connected"
              : (media.error ?? "Connecting securely…")}
          </small>
        </div>
        <nav>
          <button
            aria-label="Participants"
            aria-expanded={panel === "participants"}
            className={panel === "participants" ? "active" : ""}
            onClick={() =>
              setPanel(panel === "participants" ? null : "participants")
            }
          >
            People
          </button>
          <button
            aria-label="Today’s notes"
            aria-expanded={panel === "notes"}
            className={panel === "notes" ? "active" : ""}
            onClick={() => setPanel(panel === "notes" ? null : "notes")}
          >
            Agenda
          </button>
          <button
            aria-label="My private notes"
            aria-expanded={panel === "private"}
            className={panel === "private" ? "active" : ""}
            onClick={() => setPanel(panel === "private" ? null : "private")}
          >
            Notes
          </button>
        </nav>
      </header>
      <div className="coaching-banner">
        Coaching with <b>Keith Muoki</b> ·{" "}
        <a
          href="https://wa.me/254705960183"
          target="_blank"
          rel="noopener noreferrer"
        >
          WhatsApp
        </a>
      </div>
      {panel === "participants" ? (
        <ParticipantsPanel participants={media.participants} />
      ) : null}
      {panel === "notes" ? <SessionNotesPanel notes={notes} /> : null}
      {panel === "private" ? (
        <PrivateNotesPanel
          value={privateNotes.content}
          onChange={privateNotes.setContent}
        />
      ) : null}
      <section className="audio-grid" aria-label="Room participants">
        {media.participants.map((participant) => (
          <ParticipantTile key={participant.id} participant={participant} />
        ))}
      </section>
      <footer className="controls">
        {bootstrap.member.role !== "audience" ? (
          <button
            className="control"
            aria-label="Mute or unmute microphone"
            aria-pressed={
              media.meeting ? !media.meeting.self.audioEnabled : true
            }
            onClick={() => void media.toggleAudio()}
          >
            Mic
          </button>
        ) : null}
        <button
          className="control"
          aria-label="Raise or lower hand"
          aria-pressed="false"
          onClick={() =>
            void fetch(`/api/sessions/${bootstrap.session.id}/stage`, {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ action: "raise" }),
            })
          }
        >
          Hand
        </button>
        <button className="control leave" onClick={() => void leave()}>
          Leave
        </button>
        {bootstrap.member.role === "host" ? (
          <button
            className="control leave"
            onClick={async () => {
              if (confirm("End the session for everyone?")) {
                const response = await fetch(
                  `/api/sessions/${bootstrap.session.id}/end`,
                  { method: "POST" },
                );
                const body = (await response.json()) as { endsAt?: string };
                if (body.endsAt) setEndsAt(body.endsAt);
              }
            }}
          >
            End for all
          </button>
        ) : null}
      </footer>
      {endsAt ? (
        <EndSessionOverlay
          endsAt={endsAt}
          notes={privateNotes.content}
          onEnded={() =>
            void fetch(`/api/sessions/${bootstrap.session.id}/finalize`, {
              method: "POST",
            }).finally(() => leave())
          }
        />
      ) : null}
    </main>
  );
}
