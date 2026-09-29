import { useCallback, useEffect, useRef, useState } from "react";
import type { RoomBootstrap, SessionNotes } from "@/types/room";
import { ParticipantTile } from "./ParticipantTile";
import { ParticipantsPanel } from "./ParticipantsPanel";
import { SessionNotesPanel } from "./SessionNotesPanel";
import { PrivateNotesPanel } from "./PrivateNotesPanel";
import { EndSessionOverlay } from "./EndSessionOverlay";
import { usePrivateNotes } from "@/hooks/usePrivateNotes";
import { useKujuaRealtimeKit } from "@/hooks/useRealtimeKit";
import { useVoiceActivityReporter } from "@/hooks/useVoiceActivityReporter";
import { useRoomChat } from "@/hooks/useRoomChat";
import { createClient } from "@/lib/supabase/client";
import { useNavigate } from "react-router-dom";
import { ChatPanel } from "./ChatPanel";
import { ToolbarIcon } from "./ToolbarIcon";
import { RoomReactions } from "./RoomReactions";
import {
  clearRecoveryState,
  newClientInstanceId,
  readRecoveryState,
  saveRecoveryState,
} from "@/lib/room/recovery";
import { apiFetch } from "@/lib/api";

export function RoomScreen({
  bootstrap,
  deviceId,
  onClosed,
}: {
  bootstrap: RoomBootstrap;
  deviceId?: string;
  /** Fired once the room has been torn down, so the parent can stop rendering
      it. Navigating alone does not unmount this screen: the room route is the
      same route, so React keeps the mounted tree and the participant stays in
      a session that has already ended. */
  onClosed?: (reason: "left" | "ended") => void;
}) {
  const [panel, setPanel] = useState<
    "participants" | "chat" | "notes" | "private" | null
  >(null);
  const [notes, setNotes] = useState<SessionNotes>(bootstrap.notes);
  const [endsAt, setEndsAt] = useState(bootstrap.session.endsAt);
  const [inviteBusy, setInviteBusy] = useState(false);
  const [notice, setNotice] = useState("");
  const [moderationBusy, setModerationBusy] = useState<string>();

  const media = useKujuaRealtimeKit(
    bootstrap.member.role,
    bootstrap.member.displayName,
  );
  const selfAudioEnabled = Boolean(media.meeting?.self.audioEnabled);
  const microphoneUnlocked = media.connected;
  const [microphoneBusy, setMicrophoneBusy] = useState(false);
  const canModerate =
    bootstrap.member.role === "host" || bootstrap.member.role === "moderator";

  useVoiceActivityReporter({
    sessionId: bootstrap.session.id,
    meeting: media.meeting,
    connected: media.connected,
    enabled: microphoneUnlocked,
  });

  const connectMedia = media.connect;
  const navigate = useNavigate();
  const privateNotes = usePrivateNotes(
    bootstrap.session.id,
    bootstrap.member.userId,
  );
  const chat = useRoomChat({
    sessionId: bootstrap.session.id,
    userId: bootstrap.member.userId,
    open: panel === "chat",
  });

  const toggleChat = useCallback(() => {
    const opening = panel !== "chat";
    setPanel(opening ? "chat" : null);
    if (opening) {
      chat.markRead();
      chat.clearPreview();
    }
  }, [chat, panel]);

  /* Both the ending countdown and the realtime status change race to tear the
     room down, and the host's own click is a third caller. Latch so the media
     session is left once and /leave is posted once. */
  const closedRef = useRef(false);
  const onClosedRef = useRef(onClosed);
  useEffect(() => {
    onClosedRef.current = onClosed;
  });
  const mediaLeave = media.leave;

  const closeRoom = useCallback(
    async (reason: "left" | "ended") => {
      if (closedRef.current) return;
      closedRef.current = true;
      clearRecoveryState();
      try {
        await mediaLeave();
      } catch (cause) {
        console.warn("Unable to disconnect live audio cleanly", cause);
      }
      await apiFetch(`/sessions/${bootstrap.session.id}/leave`, {
        method: "POST",
        keepalive: true,
      }).catch(() => undefined);
      // replace: the room URL carries the invite/host query, so a back step
      // must not drop the participant straight back into an ended session.
      navigate(`/r/${bootstrap.room.slug}`, { replace: true });
      onClosedRef.current?.(reason);
    },
    [bootstrap.room.slug, bootstrap.session.id, mediaLeave, navigate],
  );

  const leave = useCallback(() => closeRoom("left"), [closeRoom]);

  /* The realtime subscription below must not resubscribe on every render, and
     closeRoom changes identity whenever the media hook returns a new object. */
  const closeRoomRef = useRef(closeRoom);
  useEffect(() => {
    closeRoomRef.current = closeRoom;
  });

  const finishSession = useCallback(async () => {
    await apiFetch(`/sessions/${bootstrap.session.id}/finalize`, {
      method: "POST",
    }).catch((cause) => console.warn("Unable to finalize the session", cause));
    await closeRoom("ended");
  }, [bootstrap.session.id, closeRoom]);

  useEffect(() => {
    if (!notice) return;
    const timeout = window.setTimeout(() => setNotice(""), 3200);
    return () => window.clearTimeout(timeout);
  }, [notice]);

  useEffect(() => {
    if (!chat.latestIncoming || panel === "chat") return;
    const timeout = window.setTimeout(() => chat.clearPreview(), 4200);
    return () => window.clearTimeout(timeout);
  }, [chat, chat.latestIncoming, panel]);

  useEffect(() => {
    let cancelled = false;
    const connect = async () => {
      const prior = readRecoveryState(bootstrap.room.slug);
      const clientInstanceId = prior?.clientInstanceId ?? newClientInstanceId();
      saveRecoveryState({
        roomSlug: bootstrap.room.slug,
        sessionId: bootstrap.session.id,
        clientInstanceId,
      });
      for (let attempt = 0; attempt < 3 && !cancelled; attempt += 1) {
        try {
          const joined = await apiFetch(
            `/sessions/${bootstrap.session.id}/join`,
            {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ clientInstanceId }),
            },
          );
          if (!joined.ok) throw new Error("join failed");
          const response = await apiFetch(
            `/sessions/${bootstrap.session.id}/media-token`,
            { method: "POST" },
          );
          if (!response.ok) throw new Error("media token failed");
          const token = (await response.json()) as { authToken: string };
          await connectMedia(
            token.authToken,
            deviceId,
            Boolean(bootstrap.recovered),
          );
          return;
        } catch (cause) {
          if (attempt === 2) {
            console.error("Room media recovery failed", cause);
            return;
          }
          await new Promise((resolve) =>
            window.setTimeout(resolve, 500 * 2 ** attempt),
          );
        }
      }
    };
    void connect();
    return () => {
      cancelled = true;
    };
  }, [
    bootstrap.recovered,
    bootstrap.room.slug,
    bootstrap.session.id,
    connectMedia,
    deviceId,
  ]);

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
        ({ new: row }) => {
          setEndsAt(typeof row.ends_at === "string" ? row.ends_at : null);
          /* finalize flips the session to "ended". Whichever participant's
             countdown got there first closes the room for everyone else, and
             a late joiner lands on an ended session and leaves immediately. */
          if (row.status === "ended" || row.status === "cancelled")
            void closeRoomRef.current("ended");
        },
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

  const muteParticipant = useCallback(
    async (userId: string) => {
      setModerationBusy(userId);
      try {
        const response = await apiFetch(
          `/sessions/${bootstrap.session.id}/participants/${userId}/mute`,
          { method: "POST" },
        );
        if (!response.ok) throw new Error("Mute authorization failed.");
        await media.muteParticipant(userId);
        setNotice("Participant muted.");
      } catch (cause) {
        setNotice(
          cause instanceof Error
            ? cause.message
            : "Unable to mute participant.",
        );
        throw cause;
      } finally {
        setModerationBusy(undefined);
      }
    },
    [bootstrap.session.id, media],
  );

  const requestParticipantUnmute = useCallback(
    async (userId: string) => {
      const meeting = media.meeting;
      if (!meeting) throw new Error("Live audio is not connected.");
      const participant = Array.from(meeting.participants.joined.values()).find(
        (item) => item.customParticipantId === userId || item.id === userId,
      );
      if (!participant)
        throw new Error("Participant is no longer connected to the live room.");

      await meeting.participants.broadcastMessage(
        "KUJUA_REQUEST_UNMUTE",
        { message: "The host asked you to unmute your microphone." },
        { participantIds: [participant.id] },
      );
      setNotice("Unmute request sent to participant.");
    },
    [media.meeting],
  );

  const muteAll = useCallback(async () => {
    setModerationBusy("all");
    try {
      const response = await apiFetch(
        `/sessions/${bootstrap.session.id}/participants/mute-all`,
        { method: "POST" },
      );
      if (!response.ok) throw new Error("Mute-all authorization failed.");
      await media.muteAll();
      setNotice("All participants muted. Everyone can unmute themselves.");
    } catch (cause) {
      setNotice(
        cause instanceof Error ? cause.message : "Unable to mute participants.",
      );
    } finally {
      setModerationBusy(undefined);
    }
  }, [bootstrap.session.id, media]);

  const toggleSelfMicrophone = useCallback(async () => {
    if (!microphoneUnlocked || microphoneBusy) return;
    setMicrophoneBusy(true);
    try {
      await media.toggleAudio();
    } catch (cause) {
      setNotice(
        cause instanceof Error
          ? cause.message
          : "Unable to change microphone state.",
      );
    } finally {
      setMicrophoneBusy(false);
    }
  }, [media, microphoneBusy, microphoneUnlocked]);

  const createInvitation = useCallback(async () => {
    if (inviteBusy) return;
    setInviteBusy(true);
    try {
      const expiresAt = new Date(
        Date.now() + 24 * 60 * 60 * 1000,
      ).toISOString();
      const response = await apiFetch("/invites/create", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          roomId: bootstrap.room.id,
          expiresAt,
          maxUses: bootstrap.room.capacity,
        }),
      });
      const body = (await response.json()) as {
        token?: string;
        error?: string;
      };
      if (!response.ok || !body.token)
        throw new Error(body.error ?? "Unable to create invitation.");

      const url = new URL(`/r/${bootstrap.room.slug}`, window.location.origin);
      url.searchParams.set("invite", body.token);
      const link = url.toString();
      try {
        await navigator.clipboard.writeText(link);
        setNotice("Participant invitation copied. It expires in 24 hours.");
      } catch {
        setNotice(`Participant invitation: ${link}`);
      }
    } catch (cause) {
      setNotice(
        cause instanceof Error ? cause.message : "Unable to create invitation.",
      );
    } finally {
      setInviteBusy(false);
    }
  }, [
    bootstrap.room.capacity,
    bootstrap.room.id,
    bootstrap.room.slug,
    inviteBusy,
  ]);

  useEffect(() => {
    const key = (event: KeyboardEvent) => {
      const tag = (event.target as HTMLElement).tagName;
      if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return;
      if (event.key.toLowerCase() === "m") void toggleSelfMicrophone();
    };
    document.addEventListener("keydown", key);
    return () => document.removeEventListener("keydown", key);
  }, [toggleSelfMicrophone]);

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
        <div className="room-identity">
          <span className="room-name">{bootstrap.room.name}</span>
          {/* One status line, not two. The old header rendered both
              media.connected and media.connectionState, which printed
              "Connected" twice whenever the room was healthy. */}
          <span
            className="room-status"
            data-state={media.connectionState}
            aria-live="polite"
          >
            <span
              className={`status-dot ${media.connected ? "" : "waiting"}`}
              aria-hidden="true"
            />
            {media.error ??
              {
                connecting: "Connecting securely…",
                connected: "Connected",
                reconnecting: "Reconnecting…",
                "connection-lost": "Connection lost",
                failed: "Unable to connect",
              }[media.connectionState]}
          </span>
        </div>
        <nav>
          <button
            aria-label={
              chat.unreadCount
                ? `Chat, ${chat.unreadCount} unread messages`
                : "Chat"
            }
            aria-expanded={panel === "chat"}
            className={`chat-nav-button${panel === "chat" ? " active" : ""}`}
            onClick={toggleChat}
          >
            <ToolbarIcon name="chat" />
            Chat
            {chat.unreadCount ? (
              <span className="chat-unread-badge" aria-hidden="true">
                {chat.unreadCount > 99 ? "99+" : chat.unreadCount}
              </span>
            ) : null}
          </button>
          <button
            aria-label="Participants"
            aria-expanded={panel === "participants"}
            className={panel === "participants" ? "active" : ""}
            onClick={() =>
              setPanel(panel === "participants" ? null : "participants")
            }
          >
            <ToolbarIcon name="users" />
            People
          </button>
          <button
            aria-label="Today’s notes"
            aria-expanded={panel === "notes"}
            className={panel === "notes" ? "active" : ""}
            onClick={() => setPanel(panel === "notes" ? null : "notes")}
          >
            <ToolbarIcon name="agenda" />
            Agenda
          </button>
          <button
            aria-label="My private notes"
            aria-expanded={panel === "private"}
            className={panel === "private" ? "active" : ""}
            onClick={() => setPanel(panel === "private" ? null : "private")}
          >
            <ToolbarIcon name="notes" />
            Notes
          </button>
        </nav>
      </header>

      {chat.latestIncoming && panel !== "chat" ? (
        <button
          type="button"
          className="chat-message-peek"
          onClick={() => {
            setPanel("chat");
            chat.markRead();
            chat.clearPreview();
          }}
        >
          <span>
            {chat.latestIncoming.recipientId
              ? "Private message"
              : "New message"}{" "}
            · <strong>{chat.latestIncoming.senderName}</strong>
          </span>
          <b>{chat.latestIncoming.message}</b>
        </button>
      ) : null}

      <div className="coaching-banner">
        For Private Coaching with <b>Keith Muoki</b> ·{" "}
        <a
          href="https://wa.me/254705960183"
          target="_blank"
          rel="noopener noreferrer"
        >
          WhatsApp
        </a>
      </div>

      {panel === "participants" ? (
        <ParticipantsPanel
          participants={media.participants}
          canModerate={canModerate}
          busyUserId={moderationBusy}
          onMute={(id) => void muteParticipant(id)}
        />
      ) : null}
      {panel === "chat" ? (
        <ChatPanel
          sessionId={bootstrap.session.id}
          userId={bootstrap.member.userId}
          selfName={bootstrap.member.displayName}
          participants={media.participants}
          messages={chat.messages}
          onRefresh={chat.refresh}
        />
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
          <ParticipantTile
            key={participant.id}
            participant={participant}
            canModerate={canModerate}
            onMute={muteParticipant}
            onRequestUnmute={requestParticipantUnmute}
          />
        ))}
      </section>

      <footer className="controls">
        <button
          className="control"
          aria-label="Open participants"
          title="People"
          onClick={() =>
            setPanel(panel === "participants" ? null : "participants")
          }
        >
          <ToolbarIcon name="users" />
          People
        </button>
        {canModerate ? (
          <button
            className="control"
            aria-label="Mute all participants"
            title="Mute all"
            disabled={Boolean(moderationBusy)}
            onClick={() => void muteAll()}
          >
            <ToolbarIcon name="volume-x" />
            Mute All
          </button>
        ) : null}

        <button
          className="control"
          aria-label="Mute or unmute microphone"
          title={
            microphoneUnlocked
              ? selfAudioEnabled
                ? "Mute microphone"
                : "Unmute microphone"
              : "Connecting audio…"
          }
          aria-pressed={!selfAudioEnabled}
          disabled={!microphoneUnlocked || microphoneBusy}
          data-locked="false"
          onClick={() => void toggleSelfMicrophone()}
        >
          <ToolbarIcon name={selfAudioEnabled ? "mic" : "mic-off"} />
          {selfAudioEnabled ? "Mute" : "Unmute"}
        </button>

        <RoomReactions meeting={media.meeting} connected={media.connected} />

        {bootstrap.member.role === "host" ? (
          <button
            className="control"
            aria-label="Invite participants"
            title="Invite participants"
            disabled={inviteBusy}
            onClick={() => void createInvitation()}
          >
            <ToolbarIcon name="user-plus" />
            {inviteBusy ? "Creating…" : "Invite"}
          </button>
        ) : null}

        <button
          className="control leave"
          aria-label="Leave room"
          title="Leave room"
          onClick={() => void leave()}
        >
          <ToolbarIcon name="log-out" />
          Leave
        </button>

        {bootstrap.member.role === "host" ? (
          <button
            className="control leave"
            aria-label="End session for everyone"
            title="End session for everyone"
            onClick={async () => {
              if (confirm("End the session for everyone?")) {
                const response = await apiFetch(
                  `/sessions/${bootstrap.session.id}/end`,
                  { method: "POST" },
                );
                const body = (await response.json()) as { endsAt?: string };
                if (body.endsAt) {
                  clearRecoveryState();
                  setEndsAt(body.endsAt);
                }
              }
            }}
          >
            <ToolbarIcon name="power" />
            End for all
          </button>
        ) : null}
      </footer>

      {notice ? (
        <div
          className="toast visible room-toast"
          role="status"
          onClick={() => setNotice("")}
        >
          {notice}
        </div>
      ) : null}

      {endsAt ? (
        <EndSessionOverlay
          endsAt={endsAt}
          notes={privateNotes.content}
          onEnded={() => void finishSession()}
        />
      ) : null}
    </main>
  );
}
