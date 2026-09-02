# Kujua Room V1 Security Audit

## Application fixes included in this branch

- Host login now uses the atomic server-side rate-limit RPC instead of a read/modify/write counter.
- Audience participants receive the audience RealtimeKit preset until stage approval; microphone capability is no longer granted pre-approval.
- Moderators cannot create other moderators or make permanent room-role changes; those operations are host-only.
- Cross-site mutating `/api/*` requests are rejected using `Sec-Fetch-Site` and same-origin validation while server-to-server calls without an Origin remain supported.
- Browser headers now include HSTS, COOP, and production upgrade-insecure-requests in addition to the existing CSP, frame, referrer, permissions and nosniff controls.
- Private note autosave updates content fields separately so database UPDATE privileges can be restricted to `content` and `updated_at`.

## Database blocker found

`public.session_participants` currently grants table-level UPDATE to `authenticated`, while the `session_participants_update_self` RLS policy only checks that `auth.uid() = user_id`. Because RLS controls rows rather than columns, a participant can potentially attempt direct Data API changes to authorization/session fields on their own row, including `current_role`.

Before V1 release:

1. Revoke browser UPDATE access to `session_participants` and remove the self-update policy; all participant state changes should go through authorized server routes/RPCs.
2. Replace legacy full grants on room tables with the minimum privileges used by the app.
3. Keep raw `anon` access off Kujua Room tables; anonymous Supabase Auth users assume the `authenticated` Postgres role and public room entry can continue through the server flow.
4. Keep direct writes only where intentionally supported (private notes), using column-level UPDATE privileges.
5. Pin `search_path` on the two simple `updated_at` trigger functions reported by the Supabase Security Advisor.
6. Move relocatable `btree_gist` from `public` to `extensions` to remove its extension functions from the exposed public schema.
7. Enable Supabase leaked-password protection in Auth settings.

## Verification status

- Vercel preview build: READY.
- No build errors on the latest security commit.
- Database hardening is deliberately not applied to production until this app branch is merged/tested, because current production private-note autosave still uses the old upsert behavior.
