/** Inspect first; pass --apply to enable self-unmute on this app's room presets. */
const {
  CLOUDFLARE_ACCOUNT_ID: account,
  CLOUDFLARE_REALTIMEKIT_APP_ID: app,
  CLOUDFLARE_API_TOKEN: token,
} = process.env;
if (!account || !app || !token)
  throw new Error("Cloudflare RealtimeKit credentials are required.");
const base = `https://api.cloudflare.com/client/v4/accounts/${account}/realtime/kit/${app}`;
async function request(path, init = {}) {
  const response = await fetch(base + path, {
    ...init,
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
  });
  const body = await response.json();
  if (!response.ok || !body.success)
    throw new Error(`RealtimeKit request failed (${response.status})`);
  return body.data ?? body.result;
}
const presets = await request("/presets?per_page=100");
const patterns = {
  host: [
    /group[_-]?call[_-]?host/i,
    /webinar[_-]?host/i,
    /host/i,
    /admin/i,
    /presenter/i,
  ],
  moderator: [
    /moderator/i,
    /group[_-]?call[_-]?host/i,
    /webinar[_-]?host/i,
    /host/i,
    /presenter/i,
  ],
  speaker: [/speaker/i, /presenter/i, /group[_-]?call[_-]?host/i, /host/i],
  audience: [
    /audience/i,
    /group[_-]?call[_-]?participant/i,
    /webinar[_-]?participant/i,
    /participant/i,
    /viewer/i,
  ],
};
const selected = new Map();
for (const [role, matchers] of Object.entries(patterns)) {
  const configured =
    process.env[`CLOUDFLARE_RTK_${role.toUpperCase()}_PRESET`] ?? role;
  const preset =
    presets.find((item) => item.name === configured) ??
    matchers
      .map((pattern) => presets.find((item) => pattern.test(item.name)))
      .find(Boolean);
  if (!preset) throw new Error(`No preset found for ${role}.`);
  selected.set(preset.id, preset);
}
for (const preset of selected.values()) {
  const current = await request(`/presets/${preset.id}`);
  if (process.argv.includes("--apply")) {
    await request(`/presets/${preset.id}`, {
      method: "PATCH",
      body: JSON.stringify({
        permissions: {
          ...current.permissions,
          stage_enabled: false,
          media: {
            ...current.permissions.media,
            audio: {
              ...current.permissions.media.audio,
              can_produce: "ALLOWED",
            },
          },
        },
      }),
    });
  }
  const verified = process.argv.includes("--apply")
    ? await request(`/presets/${preset.id}`)
    : current;
  console.info(
    `${preset.name}: audio=${verified.permissions.media.audio.can_produce}, stage_enabled=${verified.permissions.stage_enabled}`,
  );
  if (
    process.argv.includes("--apply") &&
    (verified.permissions.media.audio.can_produce !== "ALLOWED" ||
      verified.permissions.stage_enabled !== false)
  ) {
    throw new Error(`Open audio verification failed for ${preset.name}`);
  }
}
