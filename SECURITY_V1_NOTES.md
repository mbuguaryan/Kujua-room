# Kujua Room V1 Security and Session Closeout

## Application fixes included in this branch

- Host login now uses the atomic server-side rate-limit RPC instead of a read/modify/write counter.
- Audience participants receive the audience RealtimeKit preset until stage approval; microphone capability is no longer granted pre-approval.
- Moderators cannot create other moderators or make permanent room-role changes; those operations are host-only.
- Cross-site mutating `/api/*` requests are rejected using `Sec-Fetch-Site` and same-origin validation while server-to-server calls without an Origin remain supported.
- Browser headers now include HSTS, COOP, and production upgrade-insecure-requests in addition to the existing CSP, frame, referrer, permissions and nosniff controls.
- Private note autosave updates content fields separately so a later migration can restrict database UPDATE privileges to `content` and `updated_at` without changing row identity.
- Public audience joins are IP-rate-limited before anonymous Auth user creation, then user-rate-limited after authentication, preventing cookie clearing or identity rotation from bypassing the application join limiter.

## Session and background continuity

- RealtimeKit room, media, and signaling connection states are monitored explicitly.
- The app does not intentionally leave or disconnect when the document becomes hidden.
- Remote participant audio remains attached to hidden autoplaying `audio` elements while the browser permits background media.
- Media Session metadata is published to the OS where supported, and the experimental Audio Session API is set to `play-and-record` where available.
- On return from background/offline state, RealtimeKit is given a reconnect grace period. If the media/socket connection did not recover, the page reloads into the existing room recovery flow.
- Recovery obtains a fresh media token, reuses the existing client instance identity, restores the session, and starts recovered users muted for privacy.
- The voice-activity reporter flushes a final keepalive when recently observed speech is backgrounded and reconciles active speakers immediately on resume, reducing false inactivity shutdowns around mobile suspension.
- The session end countdown remains server-authoritative because it is recalculated from `endsAt - Date.now()` after browser suspension rather than incremented locally.
- A mobile operating system can still terminate a browser process. Web code cannot guarantee live WebRTC playback/microphone after process termination; that would require a native mobile client.

## Production database hardening applied

Production Supabase project `cjoqupshuruftzgzyksm` has received:

1. `20260902073803_harden_v1_browser_database_privileges`
   - removed legacy broad `anon`/`authenticated` grants from room tables
   - restored only the browser operations actually supported by the application and RLS model
   - preserved authenticated private-note access for compatibility with the currently deployed V1 code
   - preserved anonymous INSERT only for the legacy public `registrations` form
   - pinned both advisor-reported trigger function search paths to `pg_catalog`
   - moved relocatable `btree_gist` from `public` to `extensions`
   - changed default public-schema privileges so new tables/functions/sequences are not automatically exposed to `anon`/`authenticated`

2. `20260902074022_remove_direct_session_participant_updates`
   - revoked browser UPDATE on `session_participants`
   - removed `session_participants_update_self`
   - all participant role/session state changes must now go through authorized server routes/RPCs

Verification confirms:

- `authenticated` can SELECT `session_participants` but cannot UPDATE it.
- `authenticated` can SELECT `room_messages` but cannot INSERT them directly.
- raw `anon` cannot SELECT rooms.
- the legacy `registrations` form retains anonymous INSERT.
- `btree_gist` is in `extensions`.
- the two mutable-search-path advisor warnings are resolved.

## Remaining intentional advisor items

- RLS-with-no-policy INFO findings are service-only tables with no browser grants.
- Anonymous-access warnings remain because Kujua Room intentionally uses Supabase anonymous Auth for public audience users. Anonymous Auth users use the `authenticated` Postgres role and are still constrained by room membership/session RLS.
- Supabase leaked-password protection remains unavailable while the organization is on the Free plan; Supabase documents this feature as Pro-plan-and-above.

## After the branch reaches production

Private notes can be tightened one step further by revoking table-level UPDATE and granting UPDATE only on `(content, updated_at)`. Do this only after this branch's new private-note autosave code is serving production, so the older upsert implementation is not broken during deployment.
