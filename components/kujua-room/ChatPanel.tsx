"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type { Participant, RoomMessage } from "@/types/room";
import { createClient } from "@/lib/supabase/client";

export function ChatPanel({
  sessionId,
  userId,
  participants,
}: {
  sessionId: string;
  userId: string;
  participants: Participant[];
}) {
  const [messages, setMessages] = useState<RoomMessage[]>([]);
  const [text, setText] = useState("");
  const [recipient, setRecipient] = useState("");
  const [mode, setMode] = useState<"room" | "direct">("room");
  const [busy, setBusy] = useState(false);
  const [minimized, setMinimized] = useState(false);
  const [expanded, setExpanded] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement | null>(null);

  const directParticipants = useMemo(() => {
    const seen = new Set<string>();
    return participants.filter((participant) => {
      if (participant.local || participant.id === userId || seen.has(participant.id)) return false;
      seen.add(participant.id);
      return true;
    });
  }, [participants, userId]);

  useEffect(() => {
    const load = () =>
      void fetch(`/api/sessions/${sessionId}/messages`, { cache: "no-store" })
        .then((response) => response.json())
        .then((body: { messages?: RoomMessage[] }) => setMessages(body.messages ?? []));

    load();
    const supabase = createClient();
    const channel = supabase
      .channel(`messages-${sessionId}`)
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "room_messages",
          filter: `session_id=eq.${sessionId}`,
        },
        load,
      )
      .subscribe();

    return () => {
      void supabase.removeChannel(channel);
    };
  }, [sessionId]);

  const visible = useMemo(() => {
    if (mode === "room") return messages.filter((message) => message.recipientId === null);
    if (!recipient) return [];
    return messages.filter(
      (message) =>
        (message.senderId === userId && message.recipientId === recipient) ||
        (message.senderId === recipient && message.recipientId === userId),
    );
  }, [messages, mode, recipient, userId]);

  useEffect(() => {
    if (!minimized) messagesEndRef.current?.scrollIntoView({ block: "end" });
  }, [visible.length, minimized, mode, recipient]);

  async function send() {
    const message = text.trim();
    if (!message || busy) return;
    if (mode === "direct" && !recipient) return;

    setBusy(true);
    try {
      const response = await fetch(`/api/sessions/${sessionId}/messages`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          recipientId: mode === "direct" ? recipient : null,
          message,
        }),
      });
      if (!response.ok) throw new Error("Unable to send message.");
      const body = (await response.json()) as { message: RoomMessage };
      setMessages((current) =>
        current.some((item) => item.id === body.message.id)
          ? current
          : [...current, body.message],
      );
      setText("");
    } finally {
      setBusy(false);
    }
  }

  if (minimized) {
    return (
      <button
        type="button"
        className="chat-minimized"
        aria-label="Open live chat"
        onClick={() => setMinimized(false)}
      >
        <span className="chat-minimized-dot" />
        <strong>Live chat</strong>
        <span>{visible.length}</span>
      </button>
    );
  }

  return (
    <aside
      className={`chat-drawer${expanded ? " expanded" : ""}`}
      aria-label="Live class chat"
    >
      <div className="chat-drawer-head youtube-like">
        <div className="chat-title-block">
          <strong>Live chat</strong>
          <span>{mode === "room" ? `${visible.length} messages` : "Private conversation"}</span>
        </div>
        <div className="chat-window-actions">
          <button
            type="button"
            aria-label={expanded ? "Restore chat size" : "Expand chat"}
            title={expanded ? "Restore" : "Expand"}
            onClick={() => setExpanded((value) => !value)}
          >
            {expanded ? "↙" : "↗"}
          </button>
          <button
            type="button"
            aria-label="Minimize chat"
            title="Minimize"
            onClick={() => setMinimized(true)}
          >
            —
          </button>
        </div>
      </div>

      <div className="chat-tabs" role="tablist" aria-label="Chat mode">
        <button
          type="button"
          className={mode === "room" ? "active" : ""}
          onClick={() => {
            setMode("room");
            setRecipient("");
          }}
        >
          Room
        </button>
        <button
          type="button"
          className={mode === "direct" ? "active" : ""}
          onClick={() => setMode("direct")}
        >
          Private
        </button>
      </div>

      {mode === "direct" ? (
        <label className="chat-recipient">
          <span>To</span>
          <select value={recipient} onChange={(event) => setRecipient(event.target.value)}>
            <option value="">Choose a participant</option>
            {directParticipants.map((participant) => (
              <option key={participant.id} value={participant.id}>
                {participant.name}
              </option>
            ))}
          </select>
        </label>
      ) : null}

      <div className="chat-messages" aria-live="polite">
        {visible.length ? (
          visible.map((message) => (
            <article
              key={message.id}
              className={message.senderId === userId ? "chat-message mine" : "chat-message"}
            >
              <div>
                <strong>{message.senderId === userId ? "You" : message.senderName}</strong>
                {message.recipientId ? <span>Private</span> : null}
              </div>
              <p>{message.message}</p>
            </article>
          ))
        ) : (
          <div className="chat-empty">
            <strong>{mode === "room" ? "No messages yet" : "No private messages yet"}</strong>
            <span>
              {mode === "room"
                ? "Messages from everyone in the room will appear here."
                : recipient
                  ? "Only you and this participant can read these messages."
                  : "Choose a participant to start a private conversation."}
            </span>
          </div>
        )}
        <div ref={messagesEndRef} />
      </div>

      <div className="chat-compose">
        <input
          className="form-input"
          value={text}
          maxLength={2000}
          placeholder={mode === "room" ? "Say something…" : "Write a private message…"}
          disabled={mode === "direct" && !recipient}
          onChange={(event) => setText(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter" && !event.shiftKey) {
              event.preventDefault();
              void send();
            }
          }}
        />
        <button
          className="btn small primary"
          disabled={busy || !text.trim() || (mode === "direct" && !recipient)}
          onClick={() => void send()}
        >
          {busy ? "Sending…" : "Send"}
        </button>
      </div>
    </aside>
  );
}
