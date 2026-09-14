import type { RoomRole } from "@/types/room";
export type PrivilegedAction =
  | "end-session"
  | "edit-notes"
  | "change-role"
  | "remove-participant"
  | "create-invite";
const policy: Record<PrivilegedAction, readonly RoomRole[]> = {
  "end-session": ["host"],
  "edit-notes": ["host", "moderator"],
  "change-role": ["host", "moderator"],
  "remove-participant": ["host", "moderator"],
  "create-invite": ["host"],
};
export function canPerform(role: RoomRole, action: PrivilegedAction) {
  return policy[action].includes(role);
}
export function parseHostIntent(value: string) {
  const requested = /\s*\*host\*\s*$/iu.test(value);
  return {
    requested,
    displayName: value.replace(/\s*\*host\*\s*$/iu, "").trim(),
  };
}
