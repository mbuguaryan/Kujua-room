"use client";

import { useCallback, useEffect, useState } from "react";
import type { RoomBootstrap, RoomRole, SessionNotes } from "@/types/room";
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
import { createClient } from "@/lib/supabase/client";
import { useRouter } from "next/navigation";
import { ChatPanel } from "./ChatPanel";
import { clearRecoveryState, newClientInstanceId, readRecoveryState, saveRecoveryState } from "@/lib/room/recovery";

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
  const [effectiveRole, setEffectiveRole] = useState<RoomRole>(
    bootstrap.member.role,
  );
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
  const connectMedia = media.connect;
  const grantStageAccess = media.grantStageAccess;
  const denyStageAccess = media.denyStageAccess;
  const joinApprovedStage = media.joinApprovedStage;
  const router = useRouter();
  const privateNotes = usePrivateNotes(
    bootstrap.session.id,
    bootstrap.member.userId,
  );
  const canModerate =
    bootstrap.member.role === "host" || bootstrap.member.role === "moderator";

  useEffect(() => {
    let cancelled = false;
    const connect = async () => {
      const prior = readRecoveryState(bootstrap.room.slug);
      const clientInstanceId = prior?.clientInstanceId ?? newClientInstanceId();
      saveRecoveryState({ roomSlug: bootstrap.room.slug, sessionId: bootstrap.session.id, clientInstanceId });
      for (let attempt = 0; attempt < 3 && !cancelled; attempt += 1) {
        try {
          const joined = await fetch(`/api/sessions/${bootstrap.session.id}/join`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ clientInstanceId }) });
          if (!joined.ok) throw new Error("join failed");
          const response = await fetch(`/api/sessions/${bootstrap.session.id}/media-token`, { method: "POST" });
          if (!response.ok) throw new Error("media token failed");
          const token = await response.json() as { authToken: string };
          await connectMedia(token.authToken, deviceId, Boolean(bootstrap.recovered));
          return;
        } catch (cause) {
          if (attempt === 2) { console.error("Room media recovery failed", cause); return; }
          await new Promise((resolve) => window.setTimeout(resolve, 500 * (2 ** attempt)));
        }
      }
    };
    void connect();
    return () => { cancelled = true; };
  }, [bootstrap.recovered, bootstrap.room.slug, bootstrap.session.id, connectMedia, deviceId]);

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
        { event: "*", schema: "public", table: "stage_requests", filter: `session_id=eq.${bootstrap.session.id}` },
        () => setStageRevision((value) => value + 1),
      )
      .on(
        "postgres_changes",
        { event: "UPDATE", schema: "public", table: "session_participants", filter: `session_id=eq.${bootstrap.session.id}` },
        ({ new: value }) => {
          const row = value as Record<string, unknown>;
          if (row.user_id === bootstrap.member.userId && typeof row.current_role === "string") setEffectiveRole(row.current_role as RoomRole);
        },
      )
      .subscribe();
    return () => {
      void supabase.removeChannel(channel);
    };
  }, [bootstrap.member.userId, bootstrap.session.id]);

  useEffect(() => {
    let stopped = false;

    const syncStage = async () => {
      try {
        const response = await fetch(`/api/sessions/${bootstrap.session.id}/stage`, {
          cache: "no-store",
        });
        if (!response.ok || stopped) return;
        const body = (await response.json()) as {
          requests?: StageRequestItem[];
          request?: { status?: string } | null;
        };

        if (canModerate) {
          setStageRequests(body.requests ?? []);
          return;
        }

        const status = body.request?.status;
        setHandPending(status === "pending");
        if (status === "approved" && effectiveRole === "audience") {
          await joinApprovedStage();
          if (stopped) return;
          setEffectiveRole("speaker");
          setNotice("You are now on stage. Your microphone is on and ready.");
        }
      } catch (cause) {
        if (!stopped && effectiveRole === "audience") {
          console.error("Unable to join approved stage", cause);
        }
      }
    };

    void syncStage();
    const interval = window.setInterval(syncStage, 2500);
    return () => {
      stopped = true;
      window.clearInterval(interval);
    };
  }, [
    bootstrap.session.id,
    canModerate,
    effectiveRole,
    joinApprovedStage,
    stageRevision,
  ]);

  const leave = useCallback(async () => {
    await media.leave();
    await fetch(`/api/sessions/${bootstrap.session.id}/leave`, {
      method: "POST",
      keepalive: true,
    });
    clearRecoveryState();
    router.push(`/r/${bootstrap.room.slug}`);
  }, [bootstrap.room.slug, bootstrap.session.id, media, router]);

  const muteParticipant = useCallback(async (userId: string) => {
    setModerationBusy(userId);
    try {
      const response = await fetch(`/api/sessions/${bootstrap.session.id}/participants/${userId}/mute`, { method: "POST" });
      if (!response.ok) throw new Error("Mute authorization failed.");
      await media.muteParticipant(userId);
      setNotice("Participant muted. They may unmute if still allowed to speak.");
    } catch (cause) { setNotice(cause instanceof Error ? cause.message : "Unable to mute participant."); }
    finally { setModerationBusy(undefined); }
  }, [bootstrap.session.id, media]);

  const revokeSpeaker = useCallback(async (userId: string) => {
    setModerationBusy(userId);
    try {
      await denyStageAccess(userId);
      const response = await fetch(`/api/sessions/${bootstrap.session.id}/participants/${userId}/role`, { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ role: "audience", permanent: false }) });
      if (!response.ok) throw new Error("Unable to revoke speaking permission.");
      setNotice("Speaking permission revoked.");
    } catch (cause) { setNotice(cause instanceof Error ? cause.message : "Unable to revoke speaking permission."); }
    finally { setModerationBusy(undefined); }
  }, [bootstrap.session.id, denyStageAccess]);

  const muteAll = useCallback(async () => {
    setModerationBusy("all");
    try {
      const response = await fetch(`/api/sessions/${bootstrap.session.id}/participants/mute-all`, { method: "POST" });
      if (!response.ok) throw new Error("Mute-all authorization failed.");
      await media.muteAll();
      setNotice("All participants muted. Approved speakers may unmute themselves.");
    } catch (cause) { setNotice(cause instanceof Error ? cause.message : "Unable to mute participants."); }
    finally { setModerationBusy(undefined); }
  }, [bootstrap.session.id, media]);

  const toggleHand = useCallback(async () => {
    if (handBusy) return;
    setHandBusy(true);
    try {
      const action = handPending ? "cancel" : "raise";
      const response = await fetch(`/api/sessions/${bootstrap.session.id}/stage`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action }),
      });
      if (!response.ok) {
        const body = (await response.json().catch(() => ({}))) as {
          error?: string;
        };
        throw new Error(body.error ?? "Unable to update your hand.");
      }
      setHandPending(action === "raise");
      setNotice(action === "raise" ? "Request to speak sent." : "Request cancelled.");
    } catch (cause) {
      setNotice(cause instanceof Error ? cause.message : "Unable to update your hand.");
    } finally {
      setHandBusy(false);
    }
  }, [bootstrap.session.id, handBusy, handPending]);

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

        const response = await fetch(`/api/sessions/${bootstrap.session.id}/stage`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ action, requestId }),
        });
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
            ? "Participant approved. Their microphone is now available."
            : "Request declined.",
        );
      } catch (cause) {
        if (providerGranted) {
          await denyStageAccess(request.userId).catch(() => undefined);
        }
        setNotice(
          cause instanceof Error ? cause.message : "Unable to resolve stage request.",
        );
      } finally {
        setStageBusyId(undefined);
      }
    },
    [
      bootstrap.session.id,
      denyStageAccess,
      grantStageAccess,
      stageRequests,
    ],
  );

  const createInvitation = useCallback(async () => {
    if (inviteBusy) return;
    setInviteBusy(true);
    try {
      const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();
      const response = await fetch("/api/invites/create", {
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
      setNotice(cause instanceof Error ? cause.message : "Unable to create invitation.");
    } finally {
      setInviteBusy(false);
    }
  }, [bootstrap.room.capacity, bootstrap.room.id, bootstrap.room.slug, inviteBusy]);

  useEffect(() => {
    const key = (event: KeyboardEvent) => {
      const tag = (event.target as HTMLElement).tagName;
      if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return;
      if (event.key.toLowerCase() === "m" && effectiveRole !== "audience")
        void media.toggleAudio();
      if (event.key.toLowerCase() === "h" && effectiveRole === "audience")
        void toggleHand();
    };
    document.addEventListener("keydown", key);
    return () => document.removeEventListener("keydown", key);
  }, [effectiveRole, media, toggleHand]);

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
          <small className="connection-detail">{{ connecting: "Connecting", connected: "Connected", reconnecting: "Reconnecting", "connection-lost": "Connection lost", failed: "Unable to connect" }[media.connectionState]}</small>
        </div>
        <nav>
          <button aria-label="Chat" aria-expanded={panel === "chat"} className={panel === "chat" ? "active" : ""} onClick={() => setPanel(panel === "chat" ? null : "chat")}>Chat</button>
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

      {canModerate ? (
        <StageRequestsPanel
          requests={stageRequests}
          busyId={stageBusyId}
          onResolve={(requestId, action) => void resolveStage(requestId, action)}
        />
      ) : null}
      {panel === "participants" ? (
        <ParticipantsPanel participants={media.participants} canModerate={canModerate} busyUserId={moderationBusy} onMute={(id) => void muteParticipant(id)} onRevoke={(id) => void revokeSpeaker(id)} />
      ) : null}
      {panel === "chat" ? <ChatPanel sessionId={bootstrap.session.id} userId={bootstrap.member.userId} participants={media.participants} /> : null}
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
        <button className="control" onClick={() => setPanel(panel === "chat" ? null : "chat")}>Chat</button>
        <button className="control" onClick={() => setPanel(panel === "participants" ? null : "participants")}>People</button>
        {canModerate ? <button className="control" disabled={Boolean(moderationBusy)} onClick={() => void muteAll()}>Mute All</button> : null}
        {effectiveRole !== "audience" ? (
          <button
            className="control"
            aria-label="Mute or unmute microphone"
            aria-pressed={media.meeting ? !media.meeting.self.audioEnabled : true}
            onClick={() => void media.toggleAudio()}
          >
            Mic
          </button>
        ) : (
          <button
            className="control"
            aria-label={handPending ? "Lower hand" : "Raise hand"}
            aria-pressed={handPending}
            disabled={handBusy}
            onClick={() => void toggleHand()}
          >
            {handPending ? "Lower hand" : "Hand"}
          </button>
        )}

        {bootstrap.member.role === "host" ? (
          <button
            className="control"
            disabled={inviteBusy}
            onClick={() => void createInvitation()}
          >
            {inviteBusy ? "Creating…" : "Invite"}
          </button>
        ) : null}

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
                if (body.endsAt) { clearRecoveryState(); setEndsAt(body.endsAt); }
              }
            }}
          >
            End for all
          </button>
        ) : null}
      </footer>

      {notice ? (
        <div className="toast visible" role="status" onClick={() => setNotice("")}>
          {notice}
        </div>
      ) : null}

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
