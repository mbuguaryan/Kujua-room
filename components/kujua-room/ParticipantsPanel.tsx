import type { Participant } from "@/types/room";

export function ParticipantsPanel({ participants, canModerate, busyUserId, onMute, onRevoke }: { participants: Participant[]; canModerate: boolean; busyUserId?: string; onMute?: (userId: string) => void; onRevoke?: (userId: string) => void }) {
  return <section className="panel-card participant-list"><div className="panel-heading"><strong>Participants</strong><span>{participants.length}</span></div>{participants.map((p) => <div className="participant-row" key={p.id}><span>{p.name}</span><div>{p.local ? <b>You</b> : null}{p.role !== "audience" ? <b>{p.role}</b> : null}{p.muted ? <b>{p.hostMuted ? "Host muted" : "Muted"}</b> : null}{canModerate && !p.local ? <><button disabled={busyUserId === p.id || p.muted} onClick={() => onMute?.(p.id)}>Mute</button>{p.currentRole === "speaker" ? <button disabled={busyUserId === p.id} onClick={() => onRevoke?.(p.id)}>Revoke speaker</button> : null}</> : null}</div></div>)}</section>;
}
