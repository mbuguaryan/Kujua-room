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

## Running it

```bash
npm install
cp .env.example .env          # fill in VITE_* for the browser
npm run dev                   # http://localhost:3000

# API, in a second terminal (needs the Supabase CLI)
supabase start
npm run functions:serve       # reads .env.local for the server secrets
```

`MEDIA_ADAPTER=mock` keeps the whole app clickable without Cloudflare
credentials. Only real audio needs them.

## Commands

| | |
|---|---|
| `npm run dev` | Vite dev server |
| `npm run build` | typecheck → build → **secret scan** |
| `npm run test` | Vitest (39 tests) |
| `npm run test:e2e` | Playwright — needs `functions:serve` running |
| `npm run lint` | ESLint |
| `npm run check:secrets` | scan `dist/` for server-only material |
| `npm run functions:deploy` | deploy all four functions |

## What moved

| Was | Now |
|---|---|
| `app/**/page.tsx` | `src/App.tsx` (React Router) |
| `app/api/**/route.ts` (24) | `supabase/functions/{rooms,sessions,host,invites}` |
| `lib/security/*`, `lib/media/*`, `lib/cloudflare/*` | `supabase/functions/_shared/*` |
| `proxy.ts` (CSRF + session refresh) | bearer auth + `_shared/cors.ts` |
| `next.config.ts` headers | `public/_headers`, `deploy/nginx-headers.conf` |
| `next/font/google` | `<link>` in `index.html`, same CSS variables |
| cookie session | localStorage + `Authorization` header |
| `app/*.css` | `styles/*.css` — **contents unchanged** |

`lib/validation/schemas.ts`, `types/room.ts`, `lib/media/{types,mock}.ts` and
`lib/supabase/database.types.ts` are shared by both sides through the import map
in `supabase/functions/deno.json`, so there is one copy of each.

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
