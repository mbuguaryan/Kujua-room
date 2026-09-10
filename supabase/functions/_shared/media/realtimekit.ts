import { RealtimeKitApi } from "./realtimekit-api.ts";
import type { MediaAdminAdapter } from "@/lib/media/types.ts";

export class RealtimeKitAdapter implements MediaAdminAdapter {
  private api = new RealtimeKitApi();
  async createMeeting(title: string) {
    const meeting = await this.api.createMeeting(title);
    return { meetingId: meeting.id };
  }
  async addParticipant(
    input: Parameters<MediaAdminAdapter["addParticipant"]>[0],
  ) {
    const p = await this.api.addParticipant(input.meetingId, input);
    return {
      authToken: p.token,
      meetingId: input.meetingId,
      participantId: p.id,
      presetName: p.preset_name ?? this.api.preset(input.role),
    };
  }
  async updateParticipantRole(
    input: Parameters<MediaAdminAdapter["updateParticipantRole"]>[0],
  ) {
    await this.api.updateParticipant(
      input.meetingId,
      input.participantId,
      input.role,
    );
  }
  async removeParticipant(
    input: Parameters<MediaAdminAdapter["removeParticipant"]>[0],
  ) {
    await this.api.removeParticipant(input.meetingId, input.participantId);
  }
}
