"use client";
import { useCallback, useEffect, useState } from "react";
import { useRealtimeKitClient } from "@cloudflare/realtimekit-react";
import type { Participant, RoomRole } from "@/types/room";

export function useKujuaRealtimeKit(role: RoomRole, localName: string) {
  const [meeting, initMeeting] = useRealtimeKitClient();
  const [participants, setParticipants] = useState<Participant[]>([]);
  const [connected, setConnected] = useState(false);
  const [error, setError] = useState<string>();
  const sync = useCallback(() => {
    if (!meeting) return;
    const remote = Array.from(meeting.participants.joined.values()).map(
      (p) => ({
        id: p.customParticipantId ?? p.id,
        name: p.name,
        role: roleFromPreset(p.presetName),
        muted: !p.audioEnabled,
        handRaised: p.stageStatus === "REQUESTED_TO_JOIN_STAGE",
        speaking: meeting.participants.lastActiveSpeaker === p.id,
      }),
    );
    setParticipants([
      {
        id: meeting.self.customParticipantId || meeting.self.id,
        name: localName,
        role,
        muted: !meeting.self.audioEnabled,
        handRaised: meeting.self.stageStatus === "REQUESTED_TO_JOIN_STAGE",
        speaking: meeting.participants.lastActiveSpeaker === meeting.self.id,
        local: true,
      },
      ...remote,
    ]);
  }, [localName, meeting, role]);
  useEffect(() => {
    if (!meeting) return;
    const onUpdate = () => sync();
    const onSpeaker = () => sync();
    meeting.participants.joined.on("participantJoined", onUpdate);
    meeting.participants.joined.on("participantLeft", onUpdate);
    meeting.participants.on("activeSpeaker", onSpeaker);
    meeting.self.on("audioUpdate", onUpdate);
    queueMicrotask(sync);
    return () => {
      meeting.participants.joined.off("participantJoined", onUpdate);
      meeting.participants.joined.off("participantLeft", onUpdate);
      meeting.participants.off("activeSpeaker", onSpeaker);
      meeting.self.off("audioUpdate", onUpdate);
    };
  }, [meeting, sync]);
  const connect = useCallback(
    async (authToken: string, deviceId?: string) => {
      try {
        if (authToken.startsWith("mock.")) {
          setParticipants([
            {
              id: authToken.slice(5),
              name: localName,
              role,
              muted: role === "audience",
              handRaised: false,
              speaking: false,
              local: true,
            },
          ]);
          setConnected(true);
          return;
        }
        const client = await initMeeting({
          authToken,
          defaults: { audio: role !== "audience", video: false },
        });
        if (!client) throw new Error("Media initialization failed");
        if (deviceId) {
          const devices = await client.self.getAllDevices();
          const device = devices.find((item) => item.deviceId === deviceId);
          if (device) await client.self.setDevice(device);
        }
        await client.self.disableVideo();
        await client.join();
        if (role === "audience") await client.self.disableAudio();
        setConnected(true);
      } catch (cause) {
        console.error("RealtimeKit connection failed", cause);
        setError("Unable to connect to live audio.");
      }
    },
    [initMeeting, localName, role],
  );
  const toggleAudio = useCallback(async () => {
    if (!meeting) return;
    if (meeting.self.audioEnabled) await meeting.self.disableAudio();
    else await meeting.self.enableAudio();
    sync();
  }, [meeting, sync]);
  const leave = useCallback(async () => {
    if (meeting) await meeting.leave();
    setConnected(false);
  }, [meeting]);
  return {
    meeting,
    participants,
    connected,
    error,
    connect,
    toggleAudio,
    leave,
  };
}
function roleFromPreset(preset?: string): RoomRole {
  if (preset?.includes("host")) return "host";
  if (preset?.includes("moderator")) return "moderator";
  if (preset?.includes("speaker")) return "speaker";
  return "audience";
}
