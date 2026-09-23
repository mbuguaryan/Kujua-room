// @vitest-environment node
import { afterEach, expect, it, vi } from "vitest";
import { RealtimeKitApi } from "@backend/supabase/functions/_shared/media/realtimekit-api.ts";

declare global {
  const Deno: { env: { get(key: string): string | undefined } };
}

afterEach(() => vi.unstubAllGlobals());
it.each(["audience", "speaker", "moderator", "host"] as const)(
  "allows %s audio without adding moderation privileges",
  async (role) => {
    const env: Record<string, string> = {
      SUPABASE_URL: "https://example.supabase.co",
      SUPABASE_PUBLISHABLE_KEY: "test-publishable-key-12345",
      CLOUDFLARE_ACCOUNT_ID: "account",
      CLOUDFLARE_REALTIMEKIT_APP_ID: "app",
      CLOUDFLARE_API_TOKEN: "test-only",
    };
    vi.stubGlobal("Deno", { env: { get: (key: string) => env[key] } });
    const permissions = {
      stage_enabled: true,
      can_disable_other_audios: role === "host",
      media: {
        audio: { can_produce: "NOT_ALLOWED" },
        video: { can_produce: "NOT_ALLOWED" },
      },
    };
    let updated: { permissions: typeof permissions } | undefined;
    const fetchMock = vi.fn(async (url: string, init: RequestInit) => {
      let data: unknown;
      if (url.endsWith("/presets?per_page=100"))
        data = [{ id: "preset", name: role }];
      else if (url.endsWith("/presets/preset") && init.method === "GET")
        data = { permissions };
      else if (url.endsWith("/presets/preset") && init.method === "PATCH") {
        updated = JSON.parse(String(init.body));
        data = updated;
      } else if (url.endsWith("/participants?per_page=100")) data = [];
      else if (url.endsWith("/participants") && init.method === "POST") {
        expect(JSON.parse(String(init.body)).preset_name).toBe(role);
        expect(updated?.permissions.media.audio.can_produce).toBe("ALLOWED");
        data = { id: "participant", token: "test-token" };
      } else throw new Error(`Unexpected request: ${url}`);
      return new Response(JSON.stringify({ success: true, data }));
    });
    vi.stubGlobal("fetch", fetchMock);
    await new RealtimeKitApi().addParticipant("meeting", {
      userId: "user",
      name: "User",
      role,
    });
    expect(updated?.permissions.stage_enabled).toBe(false);
    expect(updated?.permissions.can_disable_other_audios).toBe(role === "host");
    expect(updated?.permissions.media.video.can_produce).toBe("NOT_ALLOWED");
  },
);
