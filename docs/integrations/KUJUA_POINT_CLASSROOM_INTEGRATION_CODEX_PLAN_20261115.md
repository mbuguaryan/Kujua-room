# Kujua Room x Kujua Point — Live Classroom Integration (Codex Plan)
Date: 2026-11-15 | Status: PLANNING ONLY / not deployed
Parent system: `mbuguaryan/KujuaPoint`. This repo remains a separate live-room application with its own secure boundary.

## Intended user journey
1. Instructor signs into Kujua Point's new teacher workspace, selects an assigned course/cohort session and starts the approved room.
2. Kujua Point backend verifies user, teacher assignment, published timetable and permitted time window.
3. A trusted server integration creates or locates the corresponding reusable Kujua Room room and **specific** session. Map IDs, don't identify by title alone.
4. Enrolled student sees the published lesson and "Join class" in Kujua Point portal. Backend verifies enrolment and session access, then issues short-lived, one-time scoped join authorization. An untrusted student-provided role is never honored.
5. Instructor controls room/mics/stage; audience raises hands. After session, synchronized status and attendance are recorded in Kujua Point with timestamps and an idempotent source-event ID. Post-session learner progress remains independent of mere presence.

## Current repository findings
- Vite/React browser UI in `frontend/`; Supabase Edge Functions for `rooms`, `sessions`, `host`, `invites`; schema in `backend/supabase/migrations/`; Cloudflare RealtimeKit adapter in `backend/supabase/functions/_shared/media/`.
- `frontend/components/kujua-room/HostDashboard.tsx` manages reusable rooms and starts sessions. `RoomScreen.tsx` supports audio, chat, notes and moderation.
- `MIGRATION.md` explicitly calls out missing live verification of audio, device mic, stage transitions, background recovery and invite-hash compatibility. These must be proven before paid cohort classes.
- Existing rooms may be public or private. Class rooms should be **private by default**, never appear on the public "Live now" directory, and deny anonymous general audience joining.

## Integration contracts (design proposal, not implemented routes)
- KujuaPoint -> Room backend: `provisionClassRoom({idempotencyKey,courseId,cohortId,sessionId,title,startsAt,endsAt,teacherExternalId,accessMode:'private'})` -> `roomId,roomSlug,roomSessionId,status`.
- KujuaPoint -> Room backend: `issueJoinGrant({sessionId,learnerId,displayName,role:'audience',expiresAt,nonce})` -> single-use scoped token or server-authenticated redirect, never Cloudflare account secret.
- Room -> KujuaPoint: `session_started|participant_joined|participant_left|session_ended` signed event with external session ID, actor mapping, timestamp and deduplication key.
- Define explicit shared contract in each repository; use mTLS/service-to-service bearer secret or signed JWT/HMAC with rotating keys stored server-side only, replay protection and strict origin validation.
- Never share service-role keys across Supabase projects, move users into a single project without migration review, trust a URL role query parameter, or use browser auth as proof of teacher authorization.
- Rooms and sessions have independent lifecycles; one room can host many non-overlapping sessions. Prevent duplicate start requests.

## Codex implementation slices
1. Inventory security and staging status; identify actual Cloudflare RealtimeKit account/app, Supabase project, deployed Vercel origin. Avoid assuming credentials exist.
2. Add internal integration service with narrow auth + rate limiting + audit logs, or adapt the existing four Edge Functions without introducing a parallel unaudited API.
3. Add mapping and signed grant validation with minimal necessary persistent fields. Use real user UUIDs / external mapping but don't leak learner identities in URLs or log tokens.
4. Implement instructor/staff session start lifecycle and learner entitlement check delegated to Kujua Point backend (server-to-server); separate moderator from host.
5. Add webhook/outbox for reliable session/attendance reconciliation; replay-safe and eventually consistent. Handle offline/reconnect safely.
6. Staging-only test against separate Cloudflare app and Supabase staging; smoke test two real devices, host/learner, mic permission, stage approval, mute-all, audio background and reconnection.
7. Record privacy/recording consent decision and data retention. Audio-only is V1; screen share/video are **not** promised without new approved scope and verified capability.

## Acceptance and security
- Non-enrolled users, revoked students and other cohorts all fail join, including attempts to reuse expired grants or elevate role.
- Only approved instructor can start/end class; duplicate calls do not create duplicate Cloudflare sessions.
- Room state and attendance reconcile after dropped connections; session end is authoritative and students are removed from ended sessions.
- Cloudflare tokens are minted exclusively server-side with preset mapped to authorized role. No open public classroom listing.
- Audit trails, clear errors, capacity limits, abuse throttles and rollback are verified before public launch.
- No changes to production secrets, DNS, Cloudflare, Supabase, or current public rooms in this planning phase.

## Codex handoff prompt
"Inspect this plan and KujuaPoint's corresponding plan. Prototype the narrow trusted interface behind flags on a feature branch, add deterministic tests and documented staging-only end-to-end verification. Do not edit production config or deploy before authorization; do not claim RealtimeKit hardware tests passed without actual devices."