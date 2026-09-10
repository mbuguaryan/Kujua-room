# Kujua Room — Vite + Tailwind + Supabase Edge Functions

The app moved off Next.js. The UI is a Vite-built React SPA; the 24 former
route handlers now run as four Supabase Edge Functions. Behaviour, design and
the security model are unchanged — what changed is where each piece runs.

## Shape

```
Browser (Vite + React Router)
  │  Authorization: Bearer <access_token>   (localStorage, refreshed by supabase-js)
  ▼
Supabase Edge Functions — rooms · sessions · host · invites
  ▸ SUPABASE_SERVICE_ROLE_KEY
  ▸ CLOUDFLARE_API_TOKEN
  │
  ├─▶ Supabase Postgres (RLS unchanged, all 16 migrations untouched)
  └─▶ Cloudflare RealtimeKit
```

## Layout

```
frontend/     React SPA — Vite, React Router, Tailwind. Owns package.json.
backend/      Supabase — Edge Functions and migrations. Runs on Deno.
legacy/       Original static prototype, kept for reference.
```

The dependency runs one way: `backend/` imports nothing from `frontend/`.
The frontend imports exactly one thing from the backend — the generated
`database.types.ts`, type-only, erased at build. Two test suites also reach
across to exercise backend logic directly.

## Running it

Everything is driven from `frontend/`:

```bash
cd frontend
npm install
cp ../.env.example .env       # keep only the VITE_* block
npm run dev                   # http://localhost:3000
```

The API is the **deployed** Edge Functions, in local dev and in production
alike, so both hit the real database and there is no local stack to keep in
sync. `frontend/.env` points `VITE_API_BASE_URL` at
`https://<project-ref>.supabase.co/functions/v1`.

To ship backend changes:

```bash
cd frontend
npm run link                  # once: supabase login, then link the project
npm run functions:deploy      # --use-api: bundles server-side, no Docker
npm run functions:logs        # tail runtime errors
```

`--use-api` matters. The default bundler pulls a 1.1 GB edge-runtime image and
runs Deno in a container; on a slow connection that is a 25-minute download
before any code is checked, and it can hang at 0% CPU with no output.

To typecheck the functions without deploying — much faster feedback:

```bash
cd backend/supabase/functions
deno check --config deno.json rooms/index.ts sessions/index.ts host/index.ts invites/index.ts
```

Function secrets live in the project, not in a file:

```bash
supabase secrets set --workdir backend \
  MEDIA_ADAPTER=mock \
  ALLOWED_ORIGINS=http://localhost:3000,http://127.0.0.1:3000,https://kujuaroom.com,https://www.kujuaroom.com \
  CLOUDFLARE_ACCOUNT_ID=... CLOUDFLARE_REALTIMEKIT_APP_ID=... CLOUDFLARE_API_TOKEN=...
```

`SUPABASE_URL`, `SUPABASE_ANON_KEY` and `SUPABASE_SERVICE_ROLE_KEY` are injected
automatically — Supabase rejects secrets starting with `SUPABASE_`.

`ALLOWED_ORIGINS` is an exact match and must include `http://localhost:3000`
alongside the live origins, or local dev is refused by CORS. It is read once at
module load, so redeploy after changing it. `rooms` and `host` are deployed with `verify_jwt = false` (see
`backend/supabase/config.toml`) because anonymous join and sign-in have no token
yet; authorization is still done in the handlers.

`MEDIA_ADAPTER=mock` keeps the whole app clickable without Cloudflare
credentials. Only real audio needs them.

## Commands

| | |
|---|---|
| `npm run dev` | Vite dev server |
| `npm run build` | typecheck → build → **secret scan** |
| `npm run test` | Vitest (39 tests) |
| `npm run test:e2e` | Playwright — hits the deployed API |
| `npm run lint` | ESLint |
| `npm run check:secrets` | scan `dist/` for server-only material |
| `npm run functions:deploy` | deploy all four functions |
| `npm run functions:logs` | tail deployed function logs |
| `npm run db:push` | apply migrations |
| `npm run types:generate` | regenerate `database.types.ts` from the schema |

## What moved

| Was | Now |
|---|---|
| `app/**/page.tsx` | `frontend/src/App.tsx` (React Router) |
| `app/api/**/route.ts` (24) | `backend/supabase/functions/{rooms,sessions,host,invites}` |
| `lib/security/*`, `lib/media/*`, `lib/cloudflare/*` | `backend/supabase/functions/_shared/*` |
| `lib/validation/schemas.ts` | `backend/.../_shared/validation.ts` |
| `lib/supabase/database.types.ts` | `backend/.../_shared/database.types.ts` |
| `proxy.ts` (CSRF + session refresh) | bearer auth + `_shared/cors.ts` |
| `next.config.ts` headers | `frontend/public/_headers`, `frontend/deploy/nginx-headers.conf` |
| `next/font/google` | `<link>` in `frontend/index.html`, same CSS variables |
| cookie session | localStorage + `Authorization` header |
| `app/*.css` | `frontend/styles/*.css` — **contents unchanged** |

`RoomRole` is derived in `_shared/types.ts` from the generated Postgres enum
rather than imported from the frontend, which is what keeps the boundary
one-directional.

## Security decisions worth keeping

Three things would have quietly regressed if ported literally. Each is load-
bearing; do not "simplify" them without reading this.

**1 · Anonymous sign-in stays server-side.** `signInAnonymously()` runs inside
the `rooms/join` function, *after* the per-IP limiter and before any user
exists. The resulting session is handed back for the browser to adopt. Moving
it into the browser would let anyone mint identities straight against Supabase
Auth, bypassing the limiter entirely — the exact hole
`SECURITY_V1_NOTES.md` records closing.

**2 · Host password sign-in stays server-side.** Same reasoning: `host/login`
rate-limits on `ip:email` *before* checking the password, verifies host
membership, and only then returns a session. A non-host never receives one.

**3 · The Cloudflare token never reaches the browser.** The preset inside a
RealtimeKit participant token decides who may speak and who may mute others.
In the browser, any audience member could mint themselves a host preset. This
is why a server tier still exists at all, and why the browser-direct-to-Supabase
design in the migration history was abandoned.

`npm run build` fails if any server secret reaches `dist/`.

## Not yet verified

The port compiles, passes 39 tests, and every route renders. What could not be
exercised without live credentials and real devices:

- Real RealtimeKit token minting and two-participant audio
- Microphone state transitions and host-approved stage promotion
- Background / reconnect recovery on a phone
- Edge Function cold-start latency on the three-request join path
- `node:crypto` invite-token hashing under Deno — **verify first**, it must
  stay byte-identical or existing invitations break

See the pre-cutover checklist in the migration plan before deploying.
