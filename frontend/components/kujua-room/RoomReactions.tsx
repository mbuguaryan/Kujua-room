import { useCallback, useEffect, useId, useRef, useState } from "react";
import { useRealtimeKitClient } from "@cloudflare/realtimekit-react";
import { ToolbarIcon } from "./ToolbarIcon";

type Meeting = ReturnType<typeof useRealtimeKitClient>[0];
export const REACTIONS = [
  ["💖", "Love"],
  ["👍", "Thumbs up"],
  ["🎉", "Celebrate"],
  ["👏", "Applause"],
  ["😂", "Laugh"],
  ["😮", "Surprised"],
  ["😢", "Sad"],
  ["🤔", "Thinking"],
  ["👎", "Thumbs down"],
] as const;
const EVENT = "KUJUA_REACTION";
const DURATION = 4500;
type Reaction = { id: string; emoji: string; name: string };

export function RoomReactions({
  meeting,
  connected,
}: {
  meeting: Meeting;
  connected: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [reactions, setReactions] = useState<Reaction[]>([]);
  const [error, setError] = useState("");
  const [sending, setSending] = useState(false);
  const wrapper = useRef<HTMLDivElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const lastSent = useRef(0);
  const pickerId = useId();

  useEffect(() => {
    if (!open) return;
    wrapper.current
      ?.querySelector<HTMLButtonElement>(".reaction-picker button")
      ?.focus();
    const dismiss = (event: PointerEvent) => {
      if (!wrapper.current?.contains(event.target as Node)) setOpen(false);
    };
    const escape = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setOpen(false);
        trigger.current?.focus();
      }
    };
    document.addEventListener("pointerdown", dismiss);
    document.addEventListener("keydown", escape);
    return () => {
      document.removeEventListener("pointerdown", dismiss);
      document.removeEventListener("keydown", escape);
    };
  }, [open]);

  useEffect(() => {
    if (!meeting || !connected) return;
    const timers = new Map<string, number>();
    const recentSenders = new Map<string, number>();
    const receive = (event: {
      type: string;
      payload: Record<string, unknown>;
    }) => {
      if (event.type !== EVENT || !event.payload) return;
      const { id, emoji, participantId } = event.payload;
      if (
        typeof id !== "string" ||
        id.length > 80 ||
        typeof participantId !== "string" ||
        !REACTIONS.some(([value]) => value === emoji) ||
        timers.has(id)
      )
        return;
      const sender =
        participantId === meeting.self.id
          ? meeting.self
          : meeting.participants.joined.get(participantId);
      if (!sender) return;
      const now = Date.now();
      for (const [peer, time] of recentSenders) {
        if (now - time > DURATION) recentSenders.delete(peer);
      }
      if (now - (recentSenders.get(participantId) ?? 0) < 700) return;
      recentSenders.set(participantId, now);
      // Bound both the visible queue and its cleanup timers in busy rooms.
      if (timers.size >= 12) {
        const oldest = timers.keys().next().value!;
        window.clearTimeout(timers.get(oldest));
        timers.delete(oldest);
      }
      setReactions((current) => [
        ...current.slice(-11),
        {
          id,
          emoji: emoji as string,
          name: sender.name || "Participant",
        },
      ]);
      timers.set(
        id,
        window.setTimeout(() => {
          setReactions((current) => current.filter((item) => item.id !== id));
          timers.delete(id);
          if (recentSenders.get(participantId) === now)
            recentSenders.delete(participantId);
        }, DURATION),
      );
    };
    meeting.participants.on("broadcastedMessage", receive);
    return () => {
      meeting.participants.off("broadcastedMessage", receive);
      for (const timer of timers.values()) window.clearTimeout(timer);
    };
  }, [meeting, connected]);

  const send = useCallback(
    async (emoji: string) => {
      if (
        !meeting ||
        !connected ||
        sending ||
        Date.now() - lastSent.current < 700
      )
        return;
      lastSent.current = Date.now();
      setSending(true);
      setError("");
      try {
        // The provider broadcasts to everyone, including the sender.
        await meeting.participants.broadcastMessage(EVENT, {
          id: crypto.randomUUID(),
          emoji,
          participantId: meeting.self.id,
        });
      } catch {
        setError("Reaction could not be sent. Try again.");
      } finally {
        setSending(false);
      }
    },
    [meeting, connected, sending],
  );

  return (
    <div className="room-reactions" ref={wrapper}>
      <button
        ref={trigger}
        type="button"
        className="control reaction-toggle"
        aria-label="Send a reaction"
        title="Reactions"
        aria-expanded={open}
        aria-controls={pickerId}
        disabled={!connected || !meeting}
        onClick={() => setOpen((value) => !value)}
      >
        <ToolbarIcon name="smile" />
        React
      </button>
      {open && connected ? (
        <div className="reaction-popover" id={pickerId}>
          <div
            className="reaction-picker"
            role="group"
            aria-label="Choose a reaction"
          >
            {REACTIONS.map(([emoji, label]) => (
              <button
                type="button"
                key={emoji}
                aria-label={label}
                title={label}
                disabled={sending}
                onClick={() => void send(emoji)}
              >
                <span aria-hidden="true">{emoji}</span>
              </button>
            ))}
          </div>
          {error ? <p role="alert">{error}</p> : null}
        </div>
      ) : null}
      <div
        className="reaction-stream"
        role="status"
        aria-label="Room reactions"
        aria-live="polite"
        aria-relevant="additions"
      >
        {connected &&
          reactions.map((reaction) => (
            <div className="floating-reaction" key={reaction.id}>
              <span>{reaction.emoji}</span>
              <b>{reaction.name}</b>
            </div>
          ))}
      </div>
    </div>
  );
}
