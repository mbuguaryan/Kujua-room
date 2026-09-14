/**
 * Same-origin used to make CORS a non-issue: the browser and the API shared an
 * origin under Next, so proxy.ts could lean on a Sec-Fetch-Site check alone.
 * Split across two origins, CORS becomes real access control — so the allowlist
 * is explicit and never echoed back from the request's own Origin header.
 */
const allowed = (Deno.env.get("ALLOWED_ORIGINS") ?? "")
  .split(",")
  .map((value) => value.trim())
  .filter(Boolean);

export function corsHeaders(request: Request): Record<string, string> {
  const origin = request.headers.get("origin");
  const headers: Record<string, string> = {
    "Access-Control-Allow-Methods": "GET,POST,PUT,DELETE,OPTIONS",
    "Access-Control-Allow-Headers": "authorization, content-type",
    "Access-Control-Max-Age": "86400",
    Vary: "Origin",
  };
  if (origin && allowed.includes(origin))
    headers["Access-Control-Allow-Origin"] = origin;
  return headers;
}

/** Rejects a cross-origin request from an origin that is not on the allowlist. */
export function originAllowed(request: Request) {
  const origin = request.headers.get("origin");
  if (!origin) return true; // server-to-server, no Origin header
  return allowed.includes(origin);
}

export function preflight(request: Request) {
  if (request.method !== "OPTIONS") return null;
  return new Response(null, { status: 204, headers: corsHeaders(request) });
}
