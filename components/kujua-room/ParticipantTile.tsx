import { useEffect, useState } from "react";
import { useRealtimeKitClient } from "@cloudflare/realtimekit-react";
import type { Participant } from "@/types/room";
import { isRemoteMicrophoneAvailable } from "@/lib/room/microphone-state";

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

type ParticipantTileProps = {
  participant: Participant;
  canModerate?: boolean;
  onMute?: (userId: string) => Promise<void> | void;
  onRequestUnmute?: (userId: string) => Promise<void> | void;
};

export function ParticipantTile({
  participant,
  canModerate = false,
  onMute,
  onRequestUnmute,
}: ParticipantTileProps) {
  const [meeting] = useRealtimeKitClient();
  const [busy, setBusy] = useState(false);
  const [controlNotice, setControlNotice] = useState("");
  const [unmutePrompt, setUnmutePrompt] = useState(false);
  const [promptError, setPromptError] = useState("");

  const canModerateParticipant = Boolean(
    canModerate && !participant.local && participant.role !== "host",
  );
  const remoteMicrophoneAvailable = isRemoteMicrophoneAvailable({
    role: participant.role,
    stageStatus: participant.stageStatus,
  });
  const canControlRemoteAudio =
    canModerateParticipant && remoteMicrophoneAvailable;

  useEffect(() => {
    if (!controlNotice) return;
    const timeout = window.setTimeout(() => setControlNotice(""), 2400);
    return () => window.clearTimeout(timeout);
  }, [controlNotice]);

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

  const controlRemoteAudio = async () => {
    if (!canControlRemoteAudio || busy) return;

    setBusy(true);
    setControlNotice("");
    try {
      if (participant.muted) {
        if (!onRequestUnmute)
          throw new Error("Unmute request is not available yet.");
        await onRequestUnmute(participant.id);
        setControlNotice("Unmute request sent.");
        return;
      }

      if (!onMute) throw new Error("Mute control is not available yet.");
      await onMute(participant.id);
      setControlNotice("Participant muted.");
    } catch (cause) {
      setControlNotice(
        cause instanceof Error ? cause.message : "Microphone control failed.",
      );
    } finally {
      setBusy(false);
    }
  };

  const acceptUnmuteRequest = async () => {
    if (!meeting) return;
    setPromptError("");
    try {
      const canProduceAudio = String(
        meeting.self.permissions.canProduceAudio ?? "",
      ).toUpperCase();
      const stageStatus = String(meeting.stage.status ?? "").toUpperCase();
      if (canProduceAudio !== "ALLOWED" && stageStatus !== "ON_STAGE") {
        throw new Error("Speaking access is not active yet.");
      }
      await meeting.self.enableAudio();
      setUnmutePrompt(false);
    } catch (cause) {
      setPromptError(
        cause instanceof Error
          ? cause.message
          : "Speaking access is not active yet.",
      );
    }
  };

  const micLabel = canControlRemoteAudio
    ? participant.muted
      ? `Ask ${participant.name} to unmute`
      : `Mute ${participant.name}`
    : canModerateParticipant && !remoteMicrophoneAvailable
      ? `${participant.name}'s microphone is locked until speaking access is approved`
      : participant.muted
        ? "Muted"
        : "Microphone on";

  return (
    <article
      className={`audio-tile ${participant.speaking ? "speaking" : ""}`}
      data-testid={`participant-${participant.id}`}
    >
      <div className="tile-badges">
        {participant.handRaised ? (
          <span aria-label="Wants to speak">✋</span>
        ) : null}
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
          : !remoteMicrophoneAvailable && !participant.local
            ? "Listening"
            : participant.muted
              ? "Muted"
              : "Connected"}
      </small>
      {participant.role === "moderator" ? (
        <span className="role-tag">Moderator</span>
      ) : null}

      {canControlRemoteAudio ? (
        <button
          type="button"
          className="participant-mic-control"
          data-muted={participant.muted ? "true" : "false"}
          data-locked="false"
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
          data-locked={
            canModerateParticipant && !remoteMicrophoneAvailable
              ? "true"
              : "false"
          }
          aria-label={micLabel}
          title={micLabel}
        >
          <MicStateIcon muted={participant.muted} />
        </span>
      )}

      {controlNotice ? (
        <span className="participant-control-note" role="status">
          {controlNotice}
        </span>
      ) : null}

      {participant.local && unmutePrompt ? (
        <div
          className="unmute-request-card"
          role="alertdialog"
          aria-live="assertive"
        >
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
