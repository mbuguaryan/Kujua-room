import "server-only";
import { serverEnv } from "@/lib/env.server";
import type { RoomRole } from "@/types/room";

type ApiEnvelope<T> = {
  success: boolean;
  result?: T;
  data?: T;
  errors?: Array<{ message: string }>;
};
export class RealtimeKitApi {
  private env = serverEnv();
  private base() {
    const {
      CLOUDFLARE_ACCOUNT_ID: a,
      CLOUDFLARE_REALTIMEKIT_APP_ID: app,
      CLOUDFLARE_API_TOKEN: token,
    } = this.env;
    if (!a || !app || !token)
      throw new Error("Cloudflare RealtimeKit credentials are not configured");
    return {
      url: `https://api.cloudflare.com/client/v4/accounts/${a}/realtime/kit/${app}`,
      token,
    };
  }
  private async request<T>(path: string, init: RequestInit) {
    const { url, token } = this.base();
    const response = await fetch(url + path, {
      ...init,
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
        ...init.headers,
      },
      cache: "no-store",
    });
    const body = (await response.json()) as ApiEnvelope<T>;
    if (!response.ok || !body.success)
      throw new Error(
        `RealtimeKit request failed (${response.status}): ${body.errors?.[0]?.message ?? "unknown"}`,
      );
    const value = body.result ?? body.data;
    if (!value) throw new Error("RealtimeKit returned no data");
    return value;
  }
  preset(role: RoomRole) {
    return {
      host: this.env.CLOUDFLARE_RTK_HOST_PRESET,
      moderator: this.env.CLOUDFLARE_RTK_MODERATOR_PRESET,
      speaker: this.env.CLOUDFLARE_RTK_SPEAKER_PRESET,
      audience: this.env.CLOUDFLARE_RTK_AUDIENCE_PRESET,
    }[role];
  }
  createMeeting(title: string) {
    return this.request<{ id: string }>("/meetings", {
      method: "POST",
      body: JSON.stringify({ title }),
    });
  }
  addParticipant(
    meetingId: string,
    input: { userId: string; name: string; role: RoomRole },
  ) {
    return this.request<{ id: string; token: string }>(
      `/meetings/${meetingId}/participants`,
      {
        method: "POST",
        body: JSON.stringify({
          custom_participant_id: input.userId,
          name: input.name,
          preset_name: this.preset(input.role),
        }),
      },
    );
  }
  updateParticipant(meetingId: string, participantId: string, role: RoomRole) {
    return this.request<unknown>(
      `/meetings/${meetingId}/participants/${participantId}`,
      {
        method: "PATCH",
        body: JSON.stringify({ preset_name: this.preset(role) }),
      },
    );
  }
  removeParticipant(meetingId: string, participantId: string) {
    return this.request<unknown>(
      `/meetings/${meetingId}/participants/${participantId}`,
      { method: "DELETE" },
    );
  }
}
