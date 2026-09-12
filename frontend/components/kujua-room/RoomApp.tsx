import { useEffect, useState } from "react";
import type { JoinState, RoomBootstrap } from "@/types/room";
import { readRecoveryState } from "@/lib/room/recovery";
import { createClient } from "@/lib/supabase/client";
import { apiFetch } from "@/lib/api";
import { JoinScreen } from "./JoinScreen";
import { RoomScreen } from "./RoomScreen";

const labels: Record<JoinState, string> = { idle: "", "validating-invite": "Validating invitation…", authenticating: "Creating your secure identity…", "requesting-microphone": "Preparing your microphone…", "testing-microphone": "Testing your microphone…", "joining-room": "Joining room…", "requesting-media-token": "Securing live audio…", "connecting-media": "Connecting securely…", connected: "Connected", reconnecting: "Connection interrupted. Reconnecting…", failed: "Unable to join the room.", ended: "This session has ended." };

type HostAccess = "public" | "private";

type JoinResponse = {
  data?: { session_id?: string; role?: string };
  session?: { access_token: string; refresh_token: string };
  error?: string;
};

export function RoomApp({ slug, inviteToken, hostEntry = false, initialName = "", hostAccess = "private" }: { slug: string; inviteToken: string; hostEntry?: boolean; initialName?: string; hostAccess?: HostAccess }) {
  const [state, setState] = useState<JoinState>("idle");
  const [error, setError] = useState("");
  const [bootstrap, setBootstrap] = useState<RoomBootstrap>();
  const [deviceId, setDeviceId] = useState<string>();
  const [closed, setClosed] = useState<"left" | "ended">();

  useEffect(() => {
    const recovery = readRecoveryState(slug);
    if (!recovery) return;
    let cancelled = false;
    void apiFetch("/rooms/recover", { method: "POST", body: JSON.stringify(recovery) })
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
      const response = await apiFetch("/rooms/join", { method: "POST", body: JSON.stringify({ slug, inviteToken: inviteToken || undefined, displayName, requestHost, accessMode: requestHost ? hostAccess : undefined }) });
      const body = await response.json() as JoinResponse;
      if (!response.ok || !body.data) throw new Error(body.error ?? "Unable to join the room.");

      // Anonymous audience identities are still minted server-side, behind the
      // IP limiter that runs before any user is created. The function hands the
      // resulting session back here to adopt, so the browser never calls
      // signInAnonymously itself and cannot rotate identity past the limiter.
      if (body.session) {
        const { error: sessionError } = await createClient().auth.setSession(body.session);
        if (sessionError) throw new Error("Unable to establish your session.");
      }

      if (requestHost && body.data.role !== "host") throw new Error("Host authorization required. Sign in through the host login page.");
      if (!body.data.session_id) throw new Error("No live session right now.");
      setState("joining-room");
      const bootResponse = await apiFetch(`/sessions/${body.data.session_id}`);
      if (!bootResponse.ok) throw new Error("Unable to prepare the live session.");
      setDeviceId(chosenDevice); setBootstrap(await bootResponse.json() as RoomBootstrap); setState("connecting-media");
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Unable to join the room."); setState("failed"); }
  }

  if (closed)
    return (
      <main className="center-state">
        <h1>{closed === "ended" ? "The session has ended" : "You left the room"}</h1>
        <p className="sub">
          {closed === "ended"
            ? "The host ended this session for everyone. Thanks for joining."
            : "You can rejoin while the session is still live."}
        </p>
        <a className="btn secondary small" href={`/r/${slug}`}>
          Back to the room
        </a>
      </main>
    );

  if (bootstrap)
    return (
      <RoomScreen
        bootstrap={bootstrap}
        deviceId={deviceId}
        /* The room route does not change when the session closes, so React
           keeps this tree mounted. Dropping the bootstrap here is what
           actually takes the participant out of the room. */
        onClosed={(reason) => {
          setBootstrap(undefined);
          setDeviceId(undefined);
          setClosed(reason);
        }}
      />
    );
  return <><JoinScreen roomSlug={slug} inviteValid={Boolean(inviteToken) || hostEntry || Boolean(initialName)} initialName={initialName} loading={!(["idle", "failed"] as JoinState[]).includes(state)} message={labels[state]} onJoin={join} />{error ? <div className="toast visible" role="alert">{error}</div> : null}</>;
}
