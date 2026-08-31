"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { createClient } from "@/lib/supabase/client";
export function usePrivateNotes(sessionId: string, userId: string) {
  const key = `kujua:notes:v1:${sessionId}:${userId}`;
  const [content, setContentState] = useState(() =>
    typeof window === "undefined" ? "" : (localStorage.getItem(key) ?? ""),
  );
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => {
    const local = localStorage.getItem(key) ?? "";
    void createClient()
      .from("private_notes")
      .select("content,updated_at")
      .eq("session_id", sessionId)
      .eq("user_id", userId)
      .maybeSingle()
      .then(({ data }) => {
        if (data?.content && !local) {
          setContentState(data.content);
          localStorage.setItem(key, data.content);
        }
      });
  }, [key, sessionId, userId]);
  const setContent = useCallback(
    (value: string) => {
      setContentState(value);
      localStorage.setItem(key, value);
      if (timer.current) clearTimeout(timer.current);
      timer.current = setTimeout(() => {
        void createClient()
          .from("private_notes")
          .upsert(
            {
              session_id: sessionId,
              user_id: userId,
              content: value,
              updated_at: new Date().toISOString(),
            },
            { onConflict: "session_id,user_id" },
          );
      }, 750);
    },
    [key, sessionId, userId],
  );
  useEffect(() => {
    const warn = (event: BeforeUnloadEvent) => {
      if (content && timer.current) event.preventDefault();
    };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [content]);
  return { content, setContent };
}
