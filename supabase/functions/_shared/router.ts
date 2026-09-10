import { preflight, corsHeaders, originAllowed } from "./cors.ts";
import { json } from "./http.ts";

type Handler = (
  request: Request,
  params: Record<string, string>,
) => Promise<Response> | Response;

type Route = { method: string; pattern: string[]; handler: Handler };

/**
 * Supabase serves each function at /functions/v1/<name>/..., and deploying 24
 * separate functions would put a cold start on every hop of the three-request
 * join waterfall. Grouping related routes behind one function keeps a warm
 * instance serving the whole sequence, so this replaces Next's file-based
 * routing with the smallest matcher that does the job.
 */
export class Router {
  private routes: Route[] = [];

  constructor(private base: string) {}

  add(method: string, path: string, handler: Handler) {
    this.routes.push({
      method,
      pattern: path.split("/").filter(Boolean),
      handler,
    });
    return this;
  }

  get(path: string, handler: Handler) { return this.add("GET", path, handler); }
  post(path: string, handler: Handler) { return this.add("POST", path, handler); }
  put(path: string, handler: Handler) { return this.add("PUT", path, handler); }

  async handle(request: Request): Promise<Response> {
    const pre = preflight(request);
    if (pre) return pre;

    if (!originAllowed(request))
      return json(request, { error: "Request origin is not allowed." }, { status: 403 });

    // Strip /functions/v1/<name> so routes are declared relative to the group.
    const segments = new URL(request.url).pathname.split("/").filter(Boolean);
    const start = segments.indexOf(this.base);
    const path = start === -1 ? segments : segments.slice(start + 1);

    for (const route of this.routes) {
      if (route.method !== request.method) continue;
      if (route.pattern.length !== path.length) continue;
      const params: Record<string, string> = {};
      let matched = true;
      for (let i = 0; i < route.pattern.length; i += 1) {
        const part = route.pattern[i];
        if (part.startsWith(":")) params[part.slice(1)] = decodeURIComponent(path[i]);
        else if (part !== path[i]) { matched = false; break; }
      }
      if (!matched) continue;
      const response = await route.handler(request, params);
      // CORS headers are applied by json(); this covers handlers returning raw Responses.
      if (!response.headers.has("Access-Control-Allow-Origin")) {
        const headers = new Headers(response.headers);
        for (const [key, value] of Object.entries(corsHeaders(request)))
          headers.set(key, value);
        return new Response(response.body, { status: response.status, headers });
      }
      return response;
    }

    return json(request, { error: "Not found." }, { status: 404 });
  }
}
