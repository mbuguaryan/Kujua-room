async function main() {
  const account = process.env.CLOUDFLARE_ACCOUNT_ID;
  const app = process.env.CLOUDFLARE_REALTIMEKIT_APP_ID;
  const token = process.env.CLOUDFLARE_API_TOKEN;
  if (!account || !app || !token)
    throw new Error(
      "Set CLOUDFLARE_ACCOUNT_ID, CLOUDFLARE_REALTIMEKIT_APP_ID, and CLOUDFLARE_API_TOKEN.",
    );
  const response = await fetch(
    `https://api.cloudflare.com/client/v4/accounts/${account}/realtime/kit/${app}/presets?per_page=100`,
    { headers: { Authorization: `Bearer ${token}` } },
  );
  const payload = (await response.json()) as {
    success: boolean;
    data?: Array<{ id: string; name: string }>;
    errors?: Array<{ message: string }>;
  };
  if (!response.ok || !payload.success)
    throw new Error(
      payload.errors?.[0]?.message ?? "RealtimeKit app verification failed",
    );
  const wanted = [
    process.env.CLOUDFLARE_RTK_HOST_PRESET ?? "host",
    process.env.CLOUDFLARE_RTK_MODERATOR_PRESET ?? "moderator",
    process.env.CLOUDFLARE_RTK_SPEAKER_PRESET ?? "speaker",
    process.env.CLOUDFLARE_RTK_AUDIENCE_PRESET ?? "audience",
  ];
  const existing = new Set((payload.data ?? []).map((preset) => preset.name));
  const missing = wanted.filter((name) => !existing.has(name));
  console.info(
    `RealtimeKit app verified. Presets: ${wanted.filter((name) => existing.has(name)).join(", ") || "none"}.`,
  );
  if (missing.length) {
    console.error(
      `Missing presets: ${missing.join(", ")}. Create them in the RealtimeKit dashboard with video/screenshare disabled; audience audio publishing NOT_ALLOWED, speaker audio ALLOWED, moderator/host moderation permissions enabled.`,
    );
    process.exitCode = 1;
  }
}

main().catch((error: unknown) => {
  console.error(
    error instanceof Error ? error.message : "RealtimeKit setup failed.",
  );
  process.exitCode = 1;
});
