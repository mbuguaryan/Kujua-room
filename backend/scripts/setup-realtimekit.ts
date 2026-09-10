async function main() {
  const account = Deno.env.get("CLOUDFLARE_ACCOUNT_ID");
  const app = Deno.env.get("CLOUDFLARE_REALTIMEKIT_APP_ID");
  const token = Deno.env.get("CLOUDFLARE_API_TOKEN");
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
    Deno.env.get("CLOUDFLARE_RTK_HOST_PRESET") ?? "host",
    Deno.env.get("CLOUDFLARE_RTK_MODERATOR_PRESET") ?? "moderator",
    Deno.env.get("CLOUDFLARE_RTK_SPEAKER_PRESET") ?? "speaker",
    Deno.env.get("CLOUDFLARE_RTK_AUDIENCE_PRESET") ?? "audience",
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
    Deno.exit(1);
  }
}

main().catch((error: unknown) => {
  console.error(
    error instanceof Error ? error.message : "RealtimeKit setup failed.",
  );
  Deno.exit(1);
});
