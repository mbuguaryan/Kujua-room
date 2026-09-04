"use client";

import { useEffect, useMemo, useState } from "react";
import { useRealtimeKitClient } from "@cloudflare/realtimekit-react";
import type { Participant } from "@/types/room";
import { readRecoveryState } from "@/lib/room/recovery";

const palette = [
  "#C1622D",
  "#8C4A2D",
  "#5F4A2D",
  "#3E5C76",
  "#2D3E4F",
  "#4A6B4A",
  "#6B5A3D",
  "#7A4A3D",
];

export function initials(name: string) {
  return name
    .trim()
    .split(/\s+/u)
    .map((part) => part[0] ?? "")
    .slice(0, 2)
    .join("")
    .toUpperCase();
}

export function avatarColor(name: string) {
  let hash = 0;
  for (const char of name)
    hash = char.codePointAt(0)! + ((hash << 5) - hash);
  return palette[Math.abs(hash) % palette.length];
}

function MicStateIcon({ muted }: { muted: boolean }) {
  const common = {
    width: 18,
    height: 18,
    viewBox: "0 0 24 24",
    fill: "none",
    stroke: "currentColor",
    strokeWidth: 2,
    strokeLinecap: "round" as const,
    strokeLinejoin: "round" as const,
    "aria-hidden": true,
    focusable: false,
  };

  if (muted) {
    return (
      <svg {...common}>
        <path d="M9 9v1a3 3 0 0 0 5.12 2.12M15 5v4M5 10a7 7 0 0 0 11.41 5.41M19 10a7 7 0 0 1-.52 2.65M12 17v5M8 22h8M3 3l18 18" />
      </svg>
    );
  }

  return (
    <svg {...common}>
      <rect x="9" y="2" width="6" height="12" rx="3" />
      <path d="M5 10a7 7 0 0 0 14 0M12 17v5M8 22h8" />
    </svg>
  );
}

export function ParticipantTile({ participant }: { participant: Participant }) {
  const [meeting] = useRealtimeKitClient();
  const [busy, setBusy] = useState(false);
  const [unmutePrompt, setUnmutePrompt] = useState(false);
  const [promptError, setPromptError] = useState("");

  const canModerateParticipant = useMemo(
    () =>
      Boolean(
        meeting &&
          !participant.local &&
          participant.role !== "host" &&
          meeting.self.permissions.canDisableParticipantAudio,
      ),
    [meeting, participant.local, participant.role],
  );

  useEffect(() => {
    if (!meeting || !participant.local) return;

    const onBroadcast = (event: { type: string }) => {
      if (event.type !== "KUJUA_REQUEST_UNMUTE") return;
      setPromptError("");
      setUnmutePrompt(true);
    };

    meeting.participants.on("broadcastedMessage", onBroadcast);
    return () => {
      meeting.participants.off("broadcastedMessage", onBroadcast);
    };
  }, [meeting, participant.local]);

  const findProviderParticipant = () => {
    if (!meeting) return undefined;
    if (participant.providerPeerId) {
      const direct = meeting.participants.joined.get(participant.providerPeerId);
      if (direct) return direct;
    }
    return Array.from(meeting.participants.joined.values()).find(
      (item) => item.customParticipantId === participant.id,
    );
  };

  const controlRemoteAudio = async () => {
    if (!meeting || !canModerateParticipant || busy) return;
    const target = findProviderParticipant();
    if (!target) return;

    setBusy(true);
    try {
      if (participant.muted) {
        await meeting.participants.broadcastMessage(
          "KUJUA_REQUEST_UNMUTE",
          { message: "The host asked you to unmute your microphone." },
          { participantIds: [target.id] },
        );
        return;
      }

      const roomSlug = window.location.pathname
        .split("/")
        .filter(Boolean)
        .at(-1);
      const sessionId = roomSlug ? readRecoveryState(roomSlug)?.sessionId : null;
      if (!sessionId) throw new Error("Session control is not ready yet.");

      const response = await fetch(
        `/api/sessions/${sessionId}/participants/${participant.id}/mute`,
        { method: "POST" },
      );
      if (!response.ok) throw new Error("Mute authorization failed.");
      await target.disableAudio();
    } finally {
      setBusy(false);
    }
  };

  const acceptUnmuteRequest = async () => {
    if (!meeting) return;
    setPromptError("");
    try {
      await meeting.self.enableAudio();
      setUnmutePrompt(false);
    } catch {
      setPromptError("Speaking access is not active yet.");
    }
  };

  const micLabel = canModerateParticipant
    ? participant.muted
      ? `Ask ${participant.name} to unmute`
      : `Mute ${participant.name}`
    : participant.muted
      ? "Muted"
      : "Microphone on";

  return (
    <article
      className={`audio-tile ${participant.speaking ? "speaking" : ""}`}
      data-testid={`participant-${participant.id}`}
    >
      <div className="tile-badges">
        {participant.handRaised ? <span aria-label="Hand raised">✋</span> : null}
        {participant.role === "host" ? <span aria-label="Host">★</span> : null}
      </div>
      <div className="avatar-ring">
        <i />
        <div
          className="avatar"
          style={{ background: avatarColor(participant.name) }}
        >
          {initials(participant.name)}
        </div>
      </div>
      <strong>
        {participant.name}
        {participant.local ? " (you)" : ""}
      </strong>
      <small>
        {participant.speaking
          ? "Speaking"
          : participant.muted
            ? "Muted"
            : "Connected"}
      </small>
      {participant.role === "moderator" ? (
        <span className="role-tag">Moderator</span>
      ) : null}

      {canModerateParticipant ? (
        <button
          type="button"
          className="participant-mic-control"
          data-muted={participant.muted ? "true" : "false"}
          aria-label={micLabel}
          title={micLabel}
          disabled={busy}
          onClick={() => void controlRemoteAudio()}
        >
          <MicStateIcon muted={participant.muted} />
        </button>
      ) : (
        <span
          className="participant-mic-control participant-mic-indicator"
          data-muted={participant.muted ? "true" : "false"}
          aria-label={micLabel}
          title={micLabel}
        >
          <MicStateIcon muted={participant.muted} />
        </span>
      )}

      {participant.local && unmutePrompt ? (
        <div className="unmute-request-card" role="alertdialog" aria-live="assertive">
          <strong>Host asked you to unmute</strong>
          <span>Turn your microphone on when you are ready to speak.</span>
          {promptError ? <small>{promptError}</small> : null}
          <div>
            <button type="button" onClick={() => void acceptUnmuteRequest()}>
              Unmute
            </button>
            <button type="button" onClick={() => setUnmutePrompt(false)}>
              Not now
            </button>
          </div>
        </div>
      ) : null}
    </article>
  );
}
