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
export async function apiFetch(path: string, init: RequestInit = {}) {
  const { VITE_API_BASE_URL } = publicEnv();
  const {
    data: { session },
  } = await createClient().auth.getSession();

  const headers = new Headers(init.headers);
  if (init.body && !headers.has("Content-Type"))
    headers.set("Content-Type", "application/json");
  if (session?.access_token)
    headers.set("Authorization", `Bearer ${session.access_token}`);

  return fetch(`${VITE_API_BASE_URL}${path}`, {
    ...init,
    headers,
    // Bearer auth, not cookies — never send credentials cross-origin.
    credentials: "omit",
  });
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
