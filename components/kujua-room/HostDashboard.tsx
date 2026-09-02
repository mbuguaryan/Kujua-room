"use client";

import { useEffect, useState, type FormEvent } from "react";
import { useRouter, useSearchParams } from "next/navigation";

type LiveSession = {
  id: string;
  title: string;
  agenda: string | null;
  goals: string | null;
  startedAt: string | null;
};

type HostRoom = {
  id: string;
  slug: string;
  name: string;
  description: string | null;
  accessMode: "public" | "private" | "invite";
  liveSession: LiveSession | null;
};

function HostRoomCard({ room, displayName }: { room: HostRoom; displayName: string }) {
  const router = useRouter();
  const [title, setTitle] = useState("");
  const [agenda, setAgenda] = useState("");
  const [goals, setGoals] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const enter = () => {
    const params = new URLSearchParams({
      host: "1",
      access: room.accessMode === "public" ? "public" : "private",
      name: displayName || "Host",
    });
    router.push(`/r/${room.slug}?${params.toString()}`);
  };

  async function startSession(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setError("");
    try {
      const response = await fetch(`/api/host/rooms/${room.id}/start`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ title, agenda, goals }),
      });
      const body = (await response.json().catch(() => null)) as { error?: string } | null;
      if (!response.ok) throw new Error(body?.error ?? "Unable to start this session.");
      enter();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Unable to start this session.");
      setBusy(false);
    }
  }

  return (
    <article className="host-room-card">
      <div className="host-room-heading">
        <div>
          <span className="host-room-kicker">Room</span>
          <h2>{room.name}</h2>
          <p>{room.description || `kujuaroom.com/r/${room.slug}`}</p>
        </div>
        <span className={`host-room-access ${room.accessMode === "public" ? "public" : "private"}`}>
          {room.accessMode === "public" ? "Public" : "Private"}
        </span>
      </div>

      {room.liveSession ? (
        <section className="host-live-session">
          <div>
            <span className="host-live-dot" /> Live now
          </div>
          <h3>{room.liveSession.title}</h3>
          {room.liveSession.agenda ? <p>{room.liveSession.agenda}</p> : null}
          {room.liveSession.goals ? <p className="host-goals-preview"><b>Goals:</b> {room.liveSession.goals}</p> : null}
          <button type="button" className="btn primary" onClick={enter}>Enter live session</button>
        </section>
      ) : (
        <form className="host-session-form" onSubmit={(event) => void startSession(event)}>
          <h3>Start a new session</h3>
          <label className="form-label" htmlFor={`title-${room.id}`}>Session title</label>
          <input
            id={`title-${room.id}`}
            className="form-input"
            value={title}
            maxLength={160}
            required
            placeholder="e.g. Q3 Leadership Planning"
            onChange={(event) => setTitle(event.target.value)}
          />
          <label className="form-label spaced" htmlFor={`agenda-${room.id}`}>Agenda</label>
          <textarea
            id={`agenda-${room.id}`}
            className="form-input host-textarea"
            value={agenda}
            maxLength={4000}
            placeholder="What will be discussed in this meeting?"
            onChange={(event) => setAgenda(event.target.value)}
          />
          <label className="form-label spaced" htmlFor={`goals-${room.id}`}>Meeting goals</label>
          <textarea
            id={`goals-${room.id}`}
            className="form-input host-textarea short"
            value={goals}
            maxLength={4000}
            placeholder="What should be achieved before the meeting ends?"
            onChange={(event) => setGoals(event.target.value)}
          />
          <button type="submit" className="btn primary spaced" disabled={busy || !title.trim()}>
            {busy ? "Starting…" : "Start session"}
          </button>
          {error ? <p className="form-error" role="alert">{error}</p> : null}
        </form>
      )}
    </article>
  );
}

export function HostDashboard() {
  const router = useRouter();
  const search = useSearchParams();
  const defaultAccess = search.get("access") === "public" ? "public" : "private";
  const [rooms, setRooms] = useState<HostRoom[]>([]);
  const [displayName, setDisplayName] = useState("Host");
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState("");
  const [roomName, setRoomName] = useState("");
  const [description, setDescription] = useState("");
  const [accessMode, setAccessMode] = useState<"public" | "private">(defaultAccess);

  async function loadRooms() {
    const response = await fetch("/api/host/rooms", { cache: "no-store" });
    if (response.status === 401 || response.status === 403) {
      router.replace(`/host/login?access=${defaultAccess}`);
      return;
    }
    const body = (await response.json()) as { rooms?: HostRoom[]; displayName?: string; error?: string };
    if (!response.ok) throw new Error(body.error ?? "Unable to load your rooms.");
    setRooms(body.rooms ?? []);
    setDisplayName(body.displayName?.trim() || "Host");
  }

  useEffect(() => {
    void loadRooms()
      .catch((cause) => setError(cause instanceof Error ? cause.message : "Unable to load your rooms."))
      .finally(() => setLoading(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function createRoom(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setCreating(true);
    setError("");
    try {
      const response = await fetch("/api/host/rooms", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ name: roomName, description, accessMode }),
      });
      const body = (await response.json().catch(() => null)) as { room?: HostRoom; error?: string } | null;
      if (!response.ok || !body?.room) throw new Error(body?.error ?? "Unable to create the room.");
      setRooms((current) => [body.room!, ...current]);
      setRoomName("");
      setDescription("");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Unable to create the room.");
    } finally {
      setCreating(false);
    }
  }

  return (
    <main className="host-dashboard">
      <div className="host-dashboard-inner">
        <header className="host-dashboard-header">
          <div>
            <span className="host-room-kicker">Kujua Room</span>
            <h1>Host workspace</h1>
            <p>Create reusable rooms, then give every live session its own title, agenda and goals.</p>
          </div>
          <button type="button" className="btn" onClick={() => router.push("/")}>Home</button>
        </header>

        <section className="host-create-card">
          <div>
            <span className="host-room-kicker">New room</span>
            <h2>Create a room</h2>
            <p>The room keeps a stable link. You can run many different sessions inside it over time.</p>
          </div>
          <form className="host-create-form" onSubmit={(event) => void createRoom(event)}>
            <label className="form-label" htmlFor="room-name">Room name</label>
            <input
              id="room-name"
              className="form-input"
              value={roomName}
              maxLength={120}
              required
              placeholder="e.g. Leadership Team"
              onChange={(event) => setRoomName(event.target.value)}
            />
            <label className="form-label spaced" htmlFor="room-description">Description <small>(optional)</small></label>
            <input
              id="room-description"
              className="form-input"
              value={description}
              maxLength={500}
              placeholder="What is this room used for?"
              onChange={(event) => setDescription(event.target.value)}
            />
            <label className="form-label spaced">Room visibility</label>
            <div className="host-access-choice">
              <button type="button" className={accessMode === "public" ? "active" : ""} onClick={() => setAccessMode("public")}>
                <b>Public</b><small>Live sessions appear on the homepage.</small>
              </button>
              <button type="button" className={accessMode === "private" ? "active" : ""} onClick={() => setAccessMode("private")}>
                <b>Private</b><small>Participants need the room or invite link.</small>
              </button>
            </div>
            <button type="submit" className="btn primary spaced" disabled={creating || !roomName.trim()}>
              {creating ? "Creating…" : "Create room"}
            </button>
          </form>
        </section>

        {error ? <p className="form-error host-dashboard-error" role="alert">{error}</p> : null}

        <section className="host-room-list">
          <div className="host-room-list-heading">
            <h2>Your rooms</h2>
            <span>{rooms.length}</span>
          </div>
          {loading ? <p>Loading rooms…</p> : null}
          {!loading && !rooms.length ? <p>No rooms yet. Create your first room above.</p> : null}
          {rooms.map((room) => <HostRoomCard key={room.id} room={room} displayName={displayName} />)}
        </section>
      </div>
    </main>
  );
}
