import { corsHeaders } from "./cors.ts";
import { log } from "./log.ts";
import { HttpError } from "./auth.ts";

export function json(
  request: Request,
  body: unknown,
  init: ResponseInit = {},
) {
  return new Response(JSON.stringify(body), {
    ...init,
    headers: {
      ...corsHeaders(request),
      "Content-Type": "application/json",
      ...(init.headers ?? {}),
    },
  });
}

/**
 * Replaces lib/security/http.ts. Same contract: HttpError surfaces its own
 * message and status, anything else is logged server-side and returned as an
 * opaque 500 so internal detail never reaches the client.
 */
export function apiError(request: Request, error: unknown, event: string) {
  if (error instanceof HttpError)
    return json(request, { error: error.message }, { status: error.status });

  // Zod validation failures are the caller's fault, not ours.
  if (error && typeof error === "object" && "issues" in error)
    return json(request, { error: "The request was not valid." }, { status: 400 });

  log("error", event, {
    message: error instanceof Error ? error.message : "unknown",
  });
  return json(
    request,
    { error: "The request could not be completed." },
    { status: 500 },
  );
}
