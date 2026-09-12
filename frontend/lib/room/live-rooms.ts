import { useEffect, useState } from "react";
import { apiFetch } from "@/lib/api";
import type { LiveRoomSummary } from "@/types/room";

export type LiveRoomsState = "loading" | "ready" | "failed";

/**
 * `GET /rooms/live` is now read by two screens — the landing page, which shows
 * what is happening, and /join, where a listener actually picks one. Keeping
 * the fetch in one place means they cannot drift apart on error handling or on
 * what "no rooms" looks like.
 *
 * Only public rooms with a live session come back; private rooms are reachable
 * through their invite link alone and never appear here.
 */
export function useLiveRooms() {
  const [rooms, setRooms] = useState<LiveRoomSummary[]>([]);
  const [state, setState] = useState<LiveRoomsState>("loading");

  useEffect(() => {
    let cancelled = false;
    void apiFetch("/rooms/live", { cache: "no-store" })
      .then(async (response) => {
        if (!response.ok) throw new Error("unavailable");
        return (await response.json()) as { rooms?: LiveRoomSummary[] };
      })
      .then((body) => {
        if (cancelled) return;
        setRooms(body.rooms ?? []);
        setState("ready");
      })
      .catch(() => {
        if (!cancelled) setState("failed");
      });
    return () => {
      cancelled = true;
    };
  }, []);

  return { rooms, state };
}
