import { useCallback, useEffect, useState } from "react";
import type { RoomBootstrap, SessionNotes } from "@/types/room";
import { ParticipantTile } from "./ParticipantTile";
import { ParticipantsPanel } from "./ParticipantsPanel";
import { SessionNotesPanel } from "./SessionNotesPanel";
import { PrivateNotesPanel } from "./PrivateNotesPanel";
import { EndSessionOverlay } from "./EndSessionOverlay";
import {
  StageRequestsPanel,
  type StageRequestItem,
} from "./StageRequestsPanel";
import { usePrivateNotes } from "@/hooks/usePrivateNotes";
import { useKujuaRealtimeKit } from "@/hooks/useRealtimeKit";
import { useVoiceActivityReporter } from "@/hooks/useVoiceActivityReporter";
import { useRoomChat } from "@/hooks/useRoomChat";
import { createClient } from "@/lib/supabase/client";
import { useNavigate } from "react-router-dom";
import { ChatPanel } from "./ChatPanel";
import { ToolbarIcon } from "./ToolbarIcon";
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
}: {
  bootstrap: RoomBootstrap;
  deviceId?: string;
}) {
  const [panel, setPanel] = useState<
    "participants" | "chat" | "notes" | "private" | null
  >(null);
  const [notes, setNotes] = useState<SessionNotes>(bootstrap.notes);
  const [endsAt, setEndsAt] = useState(bootstrap.session.endsAt);
  const [handPending, setHandPending] = useState(false);
  const [handBusy, setHandBusy] = useState(false);
  const [stageRequests, setStageRequests] = useState<StageRequestItem[]>([]);
  const [stageBusyId, setStageBusyId] = useState<string>();
  const [inviteBusy, setInviteBusy] = useState(false);
  const [notice, setNotice] = useState("");
  const [moderationBusy, setModerationBusy] = useState<string>();
  const [stageRevision, setStageRevision] = useState(0);

  const media = useKujuaRealtimeKit(
    bootstrap.member.role,
    bootstrap.member.displayName,
  );
  const selfAudioEnabled = Boolean(media.meeting?.self.audioEnabled);
  const microphoneUnlocked = Boolean(
    media.connected &&
      (media.stageStatus === "ON_STAGE" ||
        (bootstrap.member.role !== "audience" && media.canEnableSelfAudio())),
  );
  const canModerate =
    bootstrap.member.role === "host" || bootstrap.member.role === "moderator";
  const canRaiseHand =
    bootstrap.member.role === "audience" &&
    media.stageStatus !== "ON_STAGE" &&
    media.stageStatus !== "ACCEPTED_TO_JOIN_STAGE";

  useVoiceActivityReporter({
    sessionId: bootstrap.session.id,
    meeting: media.meeting,
    connected: media.connected,
    enabled: microphoneUnlocked,
  });

  const connectMedia = media.connect;
  const grantStageAccess = media.grantStageAccess;
  const denyStageAccess = media.denyStageAccess;
  const removeStageAccess = media.removeStageAccess;
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
          const joined = await fetch(
            `/api/sessions/${bootstrap.session.id}/join`,
            {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ clientInstanceId }),
            },
          );
          if (!joined.ok) throw new Error("join failed");
          const response = await fetch(
            `/api/sessions/${bootstrap.session.id}/media-token`,
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
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "stage_requests",
          filter: `session_id=eq.${bootstrap.session.id}`,
        },
        () => setStageRevision((value) => value + 1),
      )
      .subscribe();
    return () => {
      void supabase.removeChannel(channel);
    };
  }, [bootstrap.session.id]);

  useEffect(() => {
    if (canModerate) return;
    if (media.stageStatus === "ACCEPTED_TO_JOIN_STAGE") {
      setHandPending(false);
      setNotice("Speaking access approved. RealtimeKit is moving you on stage.");
      return;
    }
    if (media.stageStatus === "ON_STAGE") {
      setHandPending(false);
      setNotice("Speaking access active. Your microphone is ready to unmute.");
    }
  }, [canModerate, media.stageStatus]);

  useEffect(() => {
    let stopped = false;

    const syncStage = async () => {
      try {
        const response = await fetch(
          `/api/sessions/${bootstrap.session.id}/stage`,
          { cache: "no-store" },
        );
        if (!response.ok || stopped) return;
        const body = (await response.json()) as {
          requests?: StageRequestItem[];
          request?: { status?: string } | null;
        };

        if (canModerate) {
          setStageRequests(body.requests ?? []);
          return;
        }

        setHandPending(body.request?.status === "pending");
      } catch (cause) {
        if (!stopped) console.error("Unable to sync stage request", cause);
      }
    };

    void syncStage();
    const interval = window.setInterval(syncStage, 2500);
    return () => {
      stopped = true;
      window.clearInterval(interval);
    };
  }, [bootstrap.session.id, canModerate, stageRevision]);

  const leave = useCallback(async () => {
    await media.leave();
    await apiFetch(`/sessions/${bootstrap.session.id}/leave`, {
      method: "POST",
      keepalive: true,
    });
    clearRecoveryState();
    navigate(`/r/${bootstrap.room.slug}`);
  }, [bootstrap.room.slug, bootstrap.session.id, media, navigate]);

  const muteParticipant = useCallback(
    async (userId: string) => {
      setModerationBusy(userId);
      try {
        const response = await fetch(
          `/api/sessions/${bootstrap.session.id}/participants/${userId}/mute`,
          { method: "POST" },
        );
        if (!response.ok) throw new Error("Mute authorization failed.");
        await media.muteParticipant(userId);
        setNotice("Participant muted.");
      } catch (cause) {
        setNotice(
          cause instanceof Error ? cause.message : "Unable to mute participant.",
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
      const model = media.participants.find((item) => item.id === userId);
      const canReceiveUnmuteRequest = Boolean(
        model &&
          (model.stageStatus === "ON_STAGE" || model.role !== "audience"),
      );
      if (!canReceiveUnmuteRequest)
        throw new Error("Approve speaking access before requesting unmute.");

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
    [media.meeting, media.participants],
  );

  const revokeSpeaker = useCallback(
    async (userId: string) => {
      setModerationBusy(userId);
      try {
        await removeStageAccess(userId);
        setNotice("Speaking permission revoked. Microphone locked.");
      } catch (cause) {
        setNotice(
          cause instanceof Error
            ? cause.message
            : "Unable to revoke speaking permission.",
        );
      } finally {
        setModerationBusy(undefined);
      }
    },
    [removeStageAccess],
  );

  const muteAll = useCallback(async () => {
    setModerationBusy("all");
    try {
      const response = await fetch(
        `/api/sessions/${bootstrap.session.id}/participants/mute-all`,
        { method: "POST" },
      );
      if (!response.ok) throw new Error("Mute-all authorization failed.");
      await media.muteAll();
      setNotice("All participants muted. Approved speakers may unmute themselves.");
    } catch (cause) {
      setNotice(
        cause instanceof Error ? cause.message : "Unable to mute participants.",
      );
    } finally {
      setModerationBusy(undefined);
    }
  }, [bootstrap.session.id, media]);

  const toggleHand = useCallback(async () => {
    if (handBusy || !canRaiseHand) return;
    setHandBusy(true);
    const action = handPending ? "cancel" : "raise";
    try {
      const response = await fetch(
        `/api/sessions/${bootstrap.session.id}/stage`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ action }),
        },
      );
      if (!response.ok) {
        const body = (await response.json().catch(() => ({}))) as {
          error?: string;
        };
        throw new Error(body.error ?? "Unable to update your hand.");
      }

      if (action === "raise") {
        try {
          await media.requestStageAccess();
        } catch (cause) {
          await apiFetch(`/sessions/${bootstrap.session.id}/stage`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ action: "cancel" }),
          }).catch(() => undefined);
          throw cause;
        }
      } else {
        await media.cancelStageAccessRequest().catch((cause) =>
          console.warn("Unable to cancel provider stage request", cause),
        );
      }

      setHandPending(action === "raise");
      setNotice(
        action === "raise"
          ? "Hand raised. Waiting for host approval to speak."
          : "Hand lowered. Speaking request cancelled.",
      );
    } catch (cause) {
      setHandPending(false);
      setNotice(
        cause instanceof Error ? cause.message : "Unable to update your hand.",
      );
    } finally {
      setHandBusy(false);
    }
  }, [
    bootstrap.session.id,
    canRaiseHand,
    handBusy,
    handPending,
    media,
  ]);

  const toggleSelfMicrophone = useCallback(async () => {
    if (!microphoneUnlocked) {
      if (media.stageStatus === "ACCEPTED_TO_JOIN_STAGE") {
        setNotice("Speaking access is connecting. Microphone will unlock on stage.");
      } else if (handPending) {
        setNotice("Microphone locked. Your hand is raised; wait for host approval.");
      } else {
        setNotice("Microphone locked. Raise your hand to request speaking access.");
      }
      return;
    }
    try {
      await media.toggleAudio();
    } catch (cause) {
      setNotice(
        cause instanceof Error
          ? cause.message
          : "Unable to change microphone state.",
      );
    }
  }, [handPending, media, microphoneUnlocked]);

  const resolveStage = useCallback(
    async (requestId: string, action: "approve" | "decline") => {
      setStageBusyId(requestId);
      const request = stageRequests.find((item) => item.id === requestId);
      if (!request) {
        setNotice("That request is no longer available.");
        setStageBusyId(undefined);
        return;
      }

      let providerGranted = false;
      try {
        if (action === "approve") {
          await grantStageAccess(request.userId);
          providerGranted = true;
        }

        const response = await fetch(
          `/api/sessions/${bootstrap.session.id}/stage`,
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ action, requestId }),
          },
        );
        if (!response.ok) {
          const body = (await response.json().catch(() => ({}))) as {
            error?: string;
          };
          throw new Error(body.error ?? "Unable to resolve stage request.");
        }

        if (action === "decline") {
          await denyStageAccess(request.userId).catch(() => undefined);
        }

        setStageRequests((current) =>
          current.filter((item) => item.id !== requestId),
        );
        setNotice(
          action === "approve"
            ? "Participant approved. RealtimeKit is moving them on stage."
            : "Request declined.",
        );
      } catch (cause) {
        if (providerGranted) {
          await removeStageAccess(request.userId).catch(() => undefined);
        }
        setNotice(
          cause instanceof Error
            ? cause.message
            : "Unable to resolve stage request.",
        );
      } finally {
        setStageBusyId(undefined);
      }
    },
    [
      bootstrap.session.id,
      denyStageAccess,
      grantStageAccess,
      removeStageAccess,
      stageRequests,
    ],
  );

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
      const body = (await response.json()) as { token?: string; error?: string };
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
      if (event.key.toLowerCase() === "h" && canRaiseHand) void toggleHand();
    };
    document.addEventListener("keydown", key);
    return () => document.removeEventListener("keydown", key);
  }, [canRaiseHand, toggleHand, toggleSelfMicrophone]);

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
          <small className="connection-detail">
            {{
              connecting: "Connecting",
              connected: "Connected",
              reconnecting: "Reconnecting",
              "connection-lost": "Connection lost",
              failed: "Unable to connect",
            }[media.connectionState]}
          </small>
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
            <ToolbarIcon name="users" />People
          </button>
          <button
            aria-label="Today’s notes"
            aria-expanded={panel === "notes"}
            className={panel === "notes" ? "active" : ""}
            onClick={() => setPanel(panel === "notes" ? null : "notes")}
          >
            <ToolbarIcon name="agenda" />Agenda
          </button>
          <button
            aria-label="My private notes"
            aria-expanded={panel === "private"}
            className={panel === "private" ? "active" : ""}
            onClick={() => setPanel(panel === "private" ? null : "private")}
          >
            <ToolbarIcon name="notes" />Notes
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
            {chat.latestIncoming.recipientId ? "Private message" : "New message"} ·{" "}
            <strong>{chat.latestIncoming.senderName}</strong>
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

      {canModerate ? (
        <StageRequestsPanel
          requests={stageRequests}
          busyId={stageBusyId}
          onResolve={(requestId, action) =>
            void resolveStage(requestId, action)
          }
        />
      ) : null}
      {panel === "participants" ? (
        <ParticipantsPanel
          participants={media.participants}
          canModerate={canModerate}
          busyUserId={moderationBusy}
          onMute={(id) => void muteParticipant(id)}
          onRevoke={(id) => void revokeSpeaker(id)}
        />
      ) : null}
      {panel === "chat" ? (
        <ChatPanel
          sessionId={bootstrap.session.id}
          userId={bootstrap.member.userId}
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
          <ToolbarIcon name="users" />People
        </button>
        {canModerate ? (
          <button
            className="control"
            aria-label="Mute all participants"
            title="Mute all"
            disabled={Boolean(moderationBusy)}
            onClick={() => void muteAll()}
          >
            <ToolbarIcon name="volume-x" />Mute All
          </button>
        ) : null}

        {canRaiseHand ? (
          <button
            className="control hand-request-control"
            aria-label={handPending ? "Lower hand" : "Raise hand to speak"}
            title={handPending ? "Lower hand" : "Raise hand to speak"}
            aria-pressed={handPending}
            disabled={handBusy}
            onClick={() => void toggleHand()}
          >
            <ToolbarIcon name="hand" />
            {handPending ? "Lower" : "Ask"}
          </button>
        ) : null}

        <button
          className={`control${microphoneUnlocked ? "" : " locked-mic-control"}`}
          aria-label="Mute or unmute microphone"
          title={
            microphoneUnlocked
              ? selfAudioEnabled
                ? "Mute microphone"
                : "Unmute microphone"
              : media.stageStatus === "ACCEPTED_TO_JOIN_STAGE"
                ? "Microphone connecting to stage"
                : "Microphone locked until host approval"
          }
          aria-pressed={microphoneUnlocked ? !selfAudioEnabled : true}
          aria-disabled={!microphoneUnlocked}
          data-locked={microphoneUnlocked ? "false" : "true"}
          onClick={() => void toggleSelfMicrophone()}
        >
          <ToolbarIcon name={selfAudioEnabled ? "mic" : "mic-off"} />
          {microphoneUnlocked
            ? selfAudioEnabled
              ? "Mute"
              : "Unmute"
            : "Locked"}
        </button>

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
          <ToolbarIcon name="log-out" />Leave
        </button>

        {bootstrap.member.role === "host" ? (
          <button
            className="control leave"
            aria-label="End session for everyone"
            title="End session for everyone"
            onClick={async () => {
              if (confirm("End the session for everyone?")) {
                const response = await fetch(
                  `/api/sessions/${bootstrap.session.id}/end`,
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
            <ToolbarIcon name="power" />End for all
          </button>
        ) : null}
      </footer>

      {notice ? (
        <div
          className="toast visible"
          role="status"
          style={{ bottom: "96px", zIndex: 50 }}
          onClick={() => setNotice("")}
        >
          {notice}
        </div>
      ) : null}

      {endsAt ? (
        <EndSessionOverlay
          endsAt={endsAt}
          notes={privateNotes.content}
          onEnded={() =>
            void apiFetch(`/sessions/${bootstrap.session.id}/finalize`, {
              method: "POST",
            }).finally(() => leave())
          }
        />
      ) : null}
    </main>
  );
}
