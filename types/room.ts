export type RoomRole = "host" | "moderator" | "speaker" | "audience";
export type SessionStatus = "scheduled" | "live" | "ended" | "cancelled";
export type ConnectionState = "connecting" | "connected" | "reconnecting" | "connection-lost" | "failed";
export type JoinState = "idle" | "validating-invite" | "authenticating" | "requesting-microphone" | "testing-microphone" | "joining-room" | "requesting-media-token" | "connecting-media" | "connected" | "reconnecting" | "failed" | "ended";
export type Participant = { id: string; providerPeerId?: string; name: string; role: RoomRole; currentRole?: RoomRole; canUnmute?: boolean; hostMuted?: boolean; muted: boolean; handRaised: boolean; speaking: boolean; local?: boolean };
export type SessionNotes = { title: string; body: string; points: string[]; updatedAt?: string };
export type RoomBootstrap = { room: { id: string; slug: string; name: string; capacity: number; stageCapacity: number }; session: { id: string; title: string; status: SessionStatus; endsAt: string | null }; member: { userId: string; role: RoomRole; displayName: string }; notes: SessionNotes; recovered?: boolean };
