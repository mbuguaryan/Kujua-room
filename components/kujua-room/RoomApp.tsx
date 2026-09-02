"use client";

import { useEffect, useState } from "react";
import type { JoinState, RoomBootstrap } from "@/types/room";
import { readRecoveryState } from "@/lib/room/recovery";
import { JoinScreen } from "./JoinScreen";
import { RoomScreen } from "./RoomScreen";

const labels: Record<JoinState, string> = { idle: "", "validating-invite": "Validating invitation…", authenticating: "Creating your secure identity…", "requesting-microphone": "Preparing your microphone…", "testing-microphone": "Testing your microphone…", "joining-room": "Joining room…", "requesting-media-token": "Securing live audio…", "connecting-media": "Connecting securely…", connected: "Connected", reconnecting: "Connection interrupted. Reconnecting…", failed: "Unable to join the room.", ended: "This session has ended." };

type HostAccess = "public" | "private";

export function RoomApp({ slug, inviteToken, hostEntry = false, initialName = "", hostAccess = "private" }: { slug: string; inviteToken: string; hostEntry?: boolean; initialName?: string; hostAccess?: HostAccess }) {
  const [state, setState] = useState<JoinState>("idle");
  const [error, setError] = useState("");
  const [bootstrap, setBootstrap] = useState<RoomBootstrap>();
  const [deviceId, setDeviceId] = useState<string>();

  useEffect(() => {
    const recovery = readRecoveryState(slug);
    if (!recovery) return;
    let cancelled = false;
    void fetch("/api/rooms/recover", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(recovery) })
      .then(async (response) => { if (!response.ok) throw new Error("Unable to recover this room session."); return response.json() as Promise<RoomBootstrap>; })
      .then((value) => { if (!cancelled) setBootstrap(value); })
      .catch((cause) => { if (!cancelled) { setError(cause instanceof Error ? cause.message : "Unable to recover this room session."); setState("failed"); } });
    return () => { cancelled = true; };
  }, [slug]);

  async function join(rawName: string, chosenDevice?: string) {
    const requestedHost = /\s*\*host\*\s*$/iu.test(rawName);
    const displayName = rawName.replace(/\s*\*host\*\s*$/iu, "").trim();
    try {
      setError(""); setState("authenticating");
      const requestHost = requestedHost || hostEntry;
      const response = await fetch("/api/rooms/join", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ slug, inviteToken: inviteToken || undefined, displayName, requestHost, accessMode: requestHost ? hostAccess : undefined }) });
      const body = await response.json() as { data?: { session_id?: string; role?: string }; error?: string };
      if (!response.ok || !body.data) throw new Error(body.error ?? "Unable to join the room.");
      if (requestHost && body.data.role !== "host") throw new Error("Host authorization required. Sign in through the host login page.");
      if (!body.data.session_id) throw new Error("No live session right now.");
      setState("joining-room");
      const bootResponse = await fetch(`/api/sessions/${body.data.session_id}`);
      if (!bootResponse.ok) throw new Error("Unable to prepare the live session.");
      setDeviceId(chosenDevice); setBootstrap(await bootResponse.json() as RoomBootstrap); setState("connecting-media");
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Unable to join the room."); setState("failed"); }
  }

  if (bootstrap) return <RoomScreen bootstrap={bootstrap} deviceId={deviceId} />;
  return <><JoinScreen inviteValid={Boolean(inviteToken) || hostEntry || Boolean(initialName)} initialName={initialName} loading={!(["idle", "failed"] as JoinState[]).includes(state)} message={labels[state]} onJoin={join} />{error ? <div className="toast visible" role="alert">{error}</div> : null}</>;
}
