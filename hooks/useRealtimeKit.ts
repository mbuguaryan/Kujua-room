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
    meeting.participants.joined.on("audioUpdate", onUpdate);
    meeting.participants.on("activeSpeaker", onSpeaker);
    meeting.self.on("audioUpdate", onUpdate);
    queueMicrotask(sync);
    return () => {
      meeting.participants.joined.off("participantJoined", onUpdate);
      meeting.participants.joined.off("participantLeft", onUpdate);
      meeting.participants.joined.off("audioUpdate", onUpdate);
      meeting.participants.off("activeSpeaker", onSpeaker);
      meeting.self.off("audioUpdate", onUpdate);
    };
  }, [meeting, sync]);

  useEffect(() => {
    if (!meeting) return;

    const audioElements = new Map<string, HTMLAudioElement>();

    const attachAudio = (participant: {
      id: string;
      audioEnabled: boolean;
      audioTrack?: MediaStreamTrack | null;
    }) => {
      const track = participant.audioTrack;
      if (!participant.audioEnabled || !track) {
        const existing = audioElements.get(participant.id);
        if (existing) {
          existing.pause();
          existing.srcObject = null;
          existing.remove();
          audioElements.delete(participant.id);
        }
        return;
      }

      let audio = audioElements.get(participant.id);
      if (!audio) {
        audio = document.createElement("audio");
        audio.autoplay = true;
        audio.setAttribute("playsinline", "");
        audio.setAttribute("data-realtimekit-participant", participant.id);
        audio.style.display = "none";
        document.body.appendChild(audio);
        audioElements.set(participant.id, audio);
      }

      const current = audio.srcObject as MediaStream | null;
      if (!current || current.getAudioTracks()[0]?.id !== track.id) {
        audio.srcObject = new MediaStream([track]);
      }
      void audio.play().catch((cause) => {
        console.warn("RealtimeKit remote audio autoplay blocked", cause);
      });
    };

    const detachAudio = (participant: { id: string }) => {
      const audio = audioElements.get(participant.id);
      if (!audio) return;
      audio.pause();
      audio.srcObject = null;
      audio.remove();
      audioElements.delete(participant.id);
    };

    for (const participant of meeting.participants.joined.values()) {
      attachAudio(participant);
    }

    const onJoined = (participant: {
      id: string;
      audioEnabled: boolean;
      audioTrack?: MediaStreamTrack | null;
    }) => attachAudio(participant);
    const onLeft = (participant: { id: string }) => detachAudio(participant);
    const onAudio = (
      participant: {
        id: string;
        audioEnabled: boolean;
        audioTrack?: MediaStreamTrack | null;
      },
      update: { audioEnabled: boolean; audioTrack?: MediaStreamTrack | null },
    ) =>
      attachAudio({
        id: participant.id,
        audioEnabled: update.audioEnabled,
        audioTrack: update.audioTrack ?? participant.audioTrack,
      });

    meeting.participants.joined.on("participantJoined", onJoined);
    meeting.participants.joined.on("participantLeft", onLeft);
    meeting.participants.joined.on("audioUpdate", onAudio);

    return () => {
      meeting.participants.joined.off("participantJoined", onJoined);
      meeting.participants.joined.off("participantLeft", onLeft);
      meeting.participants.joined.off("audioUpdate", onAudio);
      for (const audio of audioElements.values()) {
        audio.pause();
        audio.srcObject = null;
        audio.remove();
      }
      audioElements.clear();
    };
  }, [meeting]);

  const connect = useCallback(
    async (authToken: string, deviceId?: string) => {
      try {
        if (!authToken || typeof authToken !== "string")
          throw new Error("RealtimeKit auth token was not returned by the server");
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

  const grantStageAccess = useCallback(
    async (targetUserId: string) => {
      if (!meeting) throw new Error("Live audio is not connected.");
      const participant = Array.from(meeting.participants.joined.values()).find(
        (item) => item.customParticipantId === targetUserId,
      );
      if (!participant)
        throw new Error("Participant is no longer connected to the live room.");
      await meeting.stage.grantAccess([participant.id]);
    },
    [meeting],
  );

  const denyStageAccess = useCallback(
    async (targetUserId: string) => {
      if (!meeting) return;
      const participant = Array.from(meeting.participants.joined.values()).find(
        (item) => item.customParticipantId === targetUserId,
      );
      if (!participant) return;
      await meeting.stage.denyAccess([participant.id]);
    },
    [meeting],
  );

  const joinApprovedStage = useCallback(async () => {
    if (!meeting) throw new Error("Live audio is not connected.");
    await meeting.stage.join();
    await meeting.self.enableAudio();
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
    grantStageAccess,
    denyStageAccess,
    joinApprovedStage,
    leave,
  };
}

function roleFromPreset(preset?: string): RoomRole {
  if (preset?.includes("host")) return "host";
  if (preset?.includes("moderator")) return "moderator";
  if (preset?.includes("speaker")) return "speaker";
  return "audience";
}
