import { createClient } from "@/lib/supabase/client";
import { publicEnv } from "@/lib/env";

/**
 * Single call site for everything that used to be a same-origin `/api/*` fetch.
 *
 * Two things changed with the move off Next:
 *
 *  1. The API lives on another origin (Supabase Edge Functions), so requests
 *     are cross-origin and the functions must allow this origin explicitly.
 *  2. There is no middleware refreshing a session cookie, so identity travels
 *     as `Authorization: Bearer <access_token>`. supabase-js keeps that token
 *     fresh in localStorage; we read it per request rather than caching it.
 *
 * Keeping this in one function is what stopped the auth switch from touching
 * all fifteen call sites individually.
 */

/** Shape callers already handle: a non-ok Response with a JSON `error` body. */
function unreachable(detail: string) {
  return new Response(
    JSON.stringify({
      error:
        "Cannot reach the Kujua Room service. Check your connection and try again.",
      detail,
    }),
    { status: 503, headers: { "Content-Type": "application/json" } },
  );
}

export async function apiFetch(path: string, init: RequestInit = {}) {
  let base: string;
  try {
    base = publicEnv().VITE_API_BASE_URL;
  } catch {
    // Misconfigured env would otherwise throw on every call and strand the UI
    // in whatever loading state it set before calling.
    return unreachable("VITE_API_BASE_URL is not configured");
  }

  let accessToken: string | undefined;
  try {
    const {
      data: { session },
    } = await createClient().auth.getSession();
    accessToken = session?.access_token;
  } catch {
    // A failed token read must not stop an unauthenticated call such as
    // /rooms/live or /rooms/join from going out.
    accessToken = undefined;
  }

  const headers = new Headers(init.headers);
  if (init.body && !headers.has("Content-Type"))
    headers.set("Content-Type", "application/json");
  if (accessToken) headers.set("Authorization", `Bearer ${accessToken}`);

  try {
    return await fetch(`${base}${path}`, {
      ...init,
      headers,
      // Bearer auth, not cookies — never send credentials cross-origin.
      credentials: "omit",
    });
  } catch (cause) {
    // A rejected fetch — API down, CORS refusal, offline, DNS — must surface as
    // a response callers already know how to handle. Letting it reject strands
    // any caller that set a loading flag before awaiting: the button sits on
    // "Signing in…" forever. Same-origin under Next made this rare; a separate
    // API origin makes it routine.
    return unreachable(cause instanceof Error ? cause.message : "network error");
  }
}

/** apiFetch + JSON parsing + a thrown Error carrying the server's message. */
export async function apiJson<T>(
  path: string,
  init: RequestInit = {},
): Promise<T> {
  const response = await apiFetch(path, init);
  const body = (await response.json().catch(() => null)) as
    | (T & { error?: string })
    | null;
  if (!response.ok)
    throw new Error(body?.error ?? "The request could not be completed.");
  if (body === null) throw new Error("The server returned an empty response.");
  return body;
}
