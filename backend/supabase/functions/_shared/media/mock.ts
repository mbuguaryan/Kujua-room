import type { MediaAdminAdapter } from "./types.ts";
export class MockMediaAdapter implements MediaAdminAdapter {
  async createMeeting() {
    return { meetingId: crypto.randomUUID() };
  }
  async addParticipant(
    input: Parameters<MediaAdminAdapter["addParticipant"]>[0],
  ) {
    return {
      authToken: `mock.${input.userId}`,
      meetingId: input.meetingId,
      participantId: input.userId,
      presetName: input.role,
    };
  }
  async updateParticipantRole() {}
  async removeParticipant() {}
}
