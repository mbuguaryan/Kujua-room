"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import type { RoomMessage } from "@/types/room";

export function useRoomChat({
  sessionId,
  userId,
  open,
}: {
  sessionId: string;
  userId: string;
  open: boolean;
}) {
  const [messages, setMessages] = useState<RoomMessage[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [latestIncoming, setLatestIncoming] = useState<RoomMessage | null>(null);
  const knownIds = useRef(new Set<string>());
  const loadedOnce = useRef(false);
  const openRef = useRef(open);

  useEffect(() => {
    openRef.current = open;
    if (open) setUnreadCount(0);
  }, [open]);

  const refresh = useCallback(async () => {
    const response = await fetch(`/api/sessions/${sessionId}/messages`, {
      cache: "no-store",
    });
    if (!response.ok) return;

    const body = (await response.json()) as { messages?: RoomMessage[] };
    const next = body.messages ?? [];

    if (loadedOnce.current) {
      const incoming = next.filter(
        (message) =>
          !knownIds.current.has(message.id) &&
          message.senderId !== userId &&
          (message.recipientId === null || message.recipientId === userId),
      );

      if (incoming.length) {
        setLatestIncoming(incoming[incoming.length - 1]);
        if (!openRef.current) {
          setUnreadCount((count) => count + incoming.length);
        }
      }
    }

    knownIds.current = new Set(next.map((message) => message.id));
    loadedOnce.current = true;
    setMessages(next);
  }, [sessionId, userId]);

  useEffect(() => {
    void refresh();
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
        () => void refresh(),
      )
      .subscribe();

    return () => {
      void supabase.removeChannel(channel);
    };
  }, [refresh, sessionId]);

  const markRead = useCallback(() => setUnreadCount(0), []);
  const clearPreview = useCallback(() => setLatestIncoming(null), []);

  return {
    messages,
    unreadCount,
    latestIncoming,
    refresh,
    markRead,
    clearPreview,
  };
}
