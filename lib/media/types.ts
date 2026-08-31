import type { RoomRole } from "@/types/room";
export type MediaToken = {
  authToken: string;
  meetingId: string;
  participantId: string;
  presetName: string;
};
export interface MediaAdminAdapter {
  createMeeting(title: string): Promise<{ meetingId: string }>;
  addParticipant(input: {
    meetingId: string;
    userId: string;
    name: string;
    role: RoomRole;
  }): Promise<MediaToken>;
  updateParticipantRole(input: {
    meetingId: string;
    participantId: string;
    role: RoomRole;
  }): Promise<void>;
  removeParticipant(input: {
    meetingId: string;
    participantId: string;
  }): Promise<void>;
}
