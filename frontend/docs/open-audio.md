# Open microphones and room reactions

Everyone joins muted and can unmute without host approval. Hosts and moderators can still mute participants; participants can unmute again afterward. The room no longer offers speaking requests or revocation of speaking access.

Deploy the frontend and the `sessions` Supabase Edge Function together. The media-token code enables `permissions.media.audio.can_produce = ALLOWED` and disables stage management on the resolved RealtimeKit preset before issuing a participant token. It preserves the remaining permissions, including moderation and camera restrictions. The server Cloudflare token needs permission to read and update presets. Presets are scoped to the RealtimeKit app; other meetings using those presets inherit the same audio policy.

Existing participants should leave and rejoin to receive refreshed permissions.

To inspect or apply the provider settings before deployment, run from `frontend` with server credentials available in the indicated environment file:

```sh
node --env-file=../backend/.env.local scripts/configure-open-audio.mjs
node --env-file=../backend/.env.local scripts/configure-open-audio.mjs --apply
```

Reactions use the existing RealtimeKit signaling connection. The React control broadcasts a supported emoji and displays the reaction with a participant name on every connected client, including the sender. Reactions disappear after 4.5 seconds and are not saved in chat or the database.

Verification: `npm test` and `npm run build`. For a live check, join from two devices as host and audience, unmute the audience without approval, confirm audio is heard, mute and unmute again, and send reactions from both devices.
