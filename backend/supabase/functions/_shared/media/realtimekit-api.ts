import { serverEnv } from "../env.ts";
import type { RoomRole } from "../types.ts";

type ApiEnvelope<T> = {
  success: boolean;
  result?: T;
  data?: T;
  errors?: Array<{ message: string }>;
};

type RealtimeKitParticipant = {
  id: string;
  token: string;
  preset_name?: string;
  custom_participant_id?: string;
};

type RealtimeKitParticipantSummary = {
  id: string;
  custom_participant_id: string;
  preset_name?: string;
  name?: string;
};

/**
 * Port of lib/cloudflare/realtimekit-api.ts. Unchanged in substance.
 *
 * CLOUDFLARE_API_TOKEN mints participant tokens, and the preset embedded in a
 * token decides whether its holder may speak and whether they may mute others.
 * That is why this file may only ever run server-side: with this token in the
 * browser, any audience member could mint themselves a host preset.
 */
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

    let body: ApiEnvelope<T> | undefined;
    try {
      body = (await response.json()) as ApiEnvelope<T>;
    } catch {
      throw new Error(
        `RealtimeKit request failed (${response.status}): invalid response`,
      );
    }

    if (!response.ok || !body.success)
      throw new Error(
        `RealtimeKit request failed (${response.status}): ${body.errors?.[0]?.message ?? "unknown"}`,
      );

    const value = body.result ?? body.data;
    if (value === undefined || value === null)
      throw new Error("RealtimeKit returned no data");
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

  private async resolvePreset(role: RoomRole) {
    const configured = this.preset(role);
    const presets = await this.request<Array<{ name?: string }>>(
      "/presets?per_page=100",
      { method: "GET" },
    );
    const names = presets
      .map((item) => item.name)
      .filter((name): name is string => Boolean(name));

    if (names.includes(configured)) return configured;

    const patterns: Record<RoomRole, RegExp[]> = {
      host: [/group[_-]?call[_-]?host/i, /webinar[_-]?host/i, /host/i, /admin/i, /presenter/i],
      moderator: [/moderator/i, /group[_-]?call[_-]?host/i, /webinar[_-]?host/i, /host/i, /presenter/i],
      speaker: [/speaker/i, /presenter/i, /group[_-]?call[_-]?host/i, /host/i],
      audience: [/audience/i, /group[_-]?call[_-]?participant/i, /webinar[_-]?participant/i, /participant/i, /viewer/i],
    };

    for (const pattern of patterns[role]) {
      const match = names.find((name) => pattern.test(name));
      if (match) return match;
    }

    throw new Error(
      `No RealtimeKit preset is available for role ${role}. Configured preset: ${configured}. Available presets: ${names.join(", ") || "none"}`,
    );
  }

  createMeeting(title: string) {
    return this.request<{ id: string }>("/meetings", {
      method: "POST",
      body: JSON.stringify({ title }),
    });
  }

  private async findParticipant(meetingId: string, userId: string) {
    const participants = await this.request<RealtimeKitParticipantSummary[]>(
      `/meetings/${meetingId}/participants?per_page=100`,
      { method: "GET" },
    );
    return participants.find((p) => p.custom_participant_id === userId);
  }

  async addParticipant(
    meetingId: string,
    input: { userId: string; name: string; role: RoomRole },
  ) {
    const presetName = await this.resolvePreset(input.role);

    const existing = await this.findParticipant(meetingId, input.userId);
    if (existing) {
      await this.request<RealtimeKitParticipantSummary>(
        `/meetings/${meetingId}/participants/${existing.id}`,
        {
          method: "PATCH",
          body: JSON.stringify({ name: input.name, preset_name: presetName }),
        },
      );
      const refreshed = await this.request<{ token: string }>(
        `/meetings/${meetingId}/participants/${existing.id}/token`,
        { method: "POST" },
      );
      if (!refreshed.token)
        throw new Error("RealtimeKit returned an empty participant token");
      return {
        id: existing.id,
        token: refreshed.token,
        preset_name: presetName,
        custom_participant_id: input.userId,
      } satisfies RealtimeKitParticipant;
    }

    const participant = await this.request<RealtimeKitParticipant>(
      `/meetings/${meetingId}/participants`,
      {
        method: "POST",
        body: JSON.stringify({
          custom_participant_id: input.userId,
          name: input.name,
          preset_name: presetName,
        }),
      },
    );
    if (!participant.token)
      throw new Error("RealtimeKit returned an empty participant token");
    return participant;
  }

  updateParticipant(meetingId: string, participantId: string, role: RoomRole) {
    return this.resolvePreset(role).then((presetName) =>
      this.request<unknown>(
        `/meetings/${meetingId}/participants/${participantId}`,
        { method: "PATCH", body: JSON.stringify({ preset_name: presetName }) },
      ),
    );
  }

  removeParticipant(meetingId: string, participantId: string) {
    return this.request<unknown>(
      `/meetings/${meetingId}/participants/${participantId}`,
      { method: "DELETE" },
    );
  }
}
