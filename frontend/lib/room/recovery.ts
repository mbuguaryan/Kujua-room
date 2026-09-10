export type RecoveryState = { roomSlug: string; sessionId: string; clientInstanceId: string };
const KEY = "kujua-room:recovery";
export function readRecoveryState(slug: string): RecoveryState | null {
  if (typeof window === "undefined") return null;
  try {
    const value = JSON.parse(sessionStorage.getItem(KEY) ?? "null") as Partial<RecoveryState> | null;
    if (!value || value.roomSlug !== slug || !value.sessionId || !value.clientInstanceId) return null;
    return value as RecoveryState;
  } catch { return null; }
}
export function saveRecoveryState(state: RecoveryState) { sessionStorage.setItem(KEY, JSON.stringify(state)); }
export function clearRecoveryState() { sessionStorage.removeItem(KEY); }
export function newClientInstanceId() { return crypto.randomUUID(); }
