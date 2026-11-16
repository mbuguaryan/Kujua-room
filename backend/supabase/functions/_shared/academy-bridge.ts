import { HttpError } from "./auth.ts";
import { serverEnv } from "./env.ts";

const encoder = new TextEncoder();

export function requireAcademyBridge(request: Request) {
  const expected = serverEnv().ACADEMY_BRIDGE_SECRET;
  const supplied = request.headers.get("x-academy-bridge-secret") ?? "";
  if (!expected || supplied.length !== expected.length) throw new HttpError(401, "Bridge authentication required");
  let mismatch = 0;
  for (let i = 0; i < expected.length; i += 1)
    mismatch |= expected.charCodeAt(i) ^ supplied.charCodeAt(i);
  if (mismatch !== 0) throw new HttpError(401, "Bridge authentication required");
}

export function randomToken() {
  const bytes = crypto.getRandomValues(new Uint8Array(32));
  return Array.from(bytes, (value) => value.toString(16).padStart(2, "0")).join("");
}

export async function sha256(value: string) {
  const digest = await crypto.subtle.digest("SHA-256", encoder.encode(value));
  return Array.from(new Uint8Array(digest), (item) => item.toString(16).padStart(2, "0")).join("");
}

export async function academySlug(academySessionId: string) {
  return `academy-${(await sha256(academySessionId)).slice(0, 20)}`;
}
