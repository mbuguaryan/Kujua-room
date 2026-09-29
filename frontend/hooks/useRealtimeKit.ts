import { useCallback, useEffect, useRef, useState } from "react";
import { useRealtimeKitClient } from "@cloudflare/realtimekit-react";
import { createAudioPlayback } from "@/lib/room/audio-playback";
import type {
  ConnectionState,
  Participant,
  RealtimeKitStageStatus,
  RoomRole,
} from "@/types/room";

export function useKujuaRealtimeKit(role: RoomRole, localName: string) {
  const [meeting, initMeeting] = useRealtimeKitClient();
  const [participants, setParticipants] = useState<Participant[]>([]);
  const [connected, setConnected] = useState(false);
  const [connectionState, setConnectionState] =
    useState<ConnectionState>("connecting");
  const [stageStatus, setStageStatus] =
    useState<RealtimeKitStageStatus>("UNKNOWN");
  const [error, setError] = useState<string>();
  const meetingRef = useRef(meeting);
  const connectedRef = useRef(false);
  const connectionStateRef = useRef<ConnectionState>("connecting");
  const connectingRef = useRef(false);
  const terminalRoomStateRef = useRef(false);
  const recoveryTimerRef = useRef<number | null>(null);

  useEffect(() => {
    meetingRef.current = meeting;
  }, [meeting]);

  const setStatus = useCallback(
    (next: ConnectionState, isConnected: boolean) => {
      connectionStateRef.current = next;
      connectedRef.current = isConnected;
      setConnectionState(next);
      setConnected(isConnected);
    },
    [],
  );

  const sync = useCallback(() => {
    if (!meeting) return;
    const localId = meeting.self.customParticipantId || meeting.self.id;
    const uniqueRemote = new Map<string, Participant>();

    for (const p of meeting.participants.joined.values()) {
      const stableId = p.customParticipantId ?? p.id;
      if (stableId === localId || p.id === meeting.self.id) continue;
      const remoteStageStatus = normalizeStageStatus(p.stageStatus);
      const candidate: Participant = {
        id: stableId,
        providerPeerId: p.id,
        providerUserId: p.userId,
        name: p.name,
        role: roleFromPreset(p.presetName),
        currentRole: roleFromPreset(p.presetName),
        stageStatus: remoteStageStatus,
        canUnmute: true,
        hostMuted: false,
        muted: !p.audioEnabled,
        handRaised: remoteStageStatus === "REQUESTED_TO_JOIN_STAGE",
        speaking: meeting.participants.lastActiveSpeaker === p.id,
      };
      const existing = uniqueRemote.get(stableId);
      if (!existing || candidate.speaking || (!candidate.muted && existing.muted))
        uniqueRemote.set(stableId, candidate);
    }

    const localStageStatus = normalizeStageStatus(
      meeting.stage.status ?? meeting.self.stageStatus,
    );
    setStageStatus(localStageStatus);
    setParticipants([
      {
        id: localId,
        providerPeerId: meeting.self.id,
        providerUserId: meeting.self.userId,
        name: localName,
        role,
        currentRole: role,
        stageStatus: localStageStatus,
        canUnmute: true,
        hostMuted: false,
        muted: !meeting.self.audioEnabled,
        handRaised: localStageStatus === "REQUESTED_TO_JOIN_STAGE",
        speaking: meeting.participants.lastActiveSpeaker === meeting.self.id,
        local: true,
      },
      ...uniqueRemote.values(),
    ]);
  }, [localName, meeting, role]);

  useEffect(() => {
    if (!meeting) {
      setStageStatus("UNKNOWN");
      return;
    }

    const onUpdate = () => sync();
    const onSpeaker = () => sync();
    const onStageStatus = (status: unknown) => {
      setStageStatus(normalizeStageStatus(status));
      sync();
    };
    const onStageRequestUpdate = () => sync();

    meeting.participants.joined.on("participantJoined", onUpdate);
    meeting.participants.joined.on("participantLeft", onUpdate);
    meeting.participants.joined.on("audioUpdate", onUpdate);
    meeting.participants.on("activeSpeaker", onSpeaker);
    meeting.self.on("audioUpdate", onUpdate);
    meeting.stage.on("stageStatusUpdate", onStageStatus);
    meeting.stage.on("stageAccessRequestUpdate", onStageRequestUpdate);
    queueMicrotask(sync);

    return () => {
      meeting.participants.joined.off("participantJoined", onUpdate);
      meeting.participants.joined.off("participantLeft", onUpdate);
      meeting.participants.joined.off("audioUpdate", onUpdate);
      meeting.participants.off("activeSpeaker", onSpeaker);
      meeting.self.off("audioUpdate", onUpdate);
      meeting.stage.off("stageStatusUpdate", onStageStatus);
      meeting.stage.off("stageAccessRequestUpdate", onStageRequestUpdate);
    };
  }, [meeting, sync]);

  useEffect(() => {
    if (!meeting) return;
    const audioElements = new Map<string, HTMLAudioElement>();
    const playback = createAudioPlayback();
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
        audio.preload = "auto";
        audio.setAttribute("playsinline", "");
        audio.setAttribute("data-realtimekit-participant", participant.id);
        audio.style.display = "none";
        document.body.appendChild(audio);
        audioElements.set(participant.id, audio);
      }
      const current = audio.srcObject as MediaStream | null;
      if (!current || current.getAudioTracks()[0]?.id !== track.id)
        audio.srcObject = new MediaStream([track]);
      playback.play(audio);
    };
    const detachAudio = (participant: { id: string }) => {
      const audio = audioElements.get(participant.id);
      if (!audio) return;
      audio.pause();
      audio.srcObject = null;
      audio.remove();
      audioElements.delete(participant.id);
    };
    for (const participant of meeting.participants.joined.values())
      attachAudio(participant);
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
      playback.dispose();
      for (const audio of audioElements.values()) {
        audio.pause();
        audio.srcObject = null;
        audio.remove();
      }
      audioElements.clear();
    };
  }, [meeting]);

  const schedulePageRecovery = useCallback((delay = 4500) => {
    if (
      terminalRoomStateRef.current ||
      document.visibilityState !== "visible" ||
      !navigator.onLine
    )
      return;
    if (recoveryTimerRef.current !== null)
      window.clearTimeout(recoveryTimerRef.current);
    recoveryTimerRef.current = window.setTimeout(() => {
      recoveryTimerRef.current = null;
      if (
        terminalRoomStateRef.current ||
        document.visibilityState !== "visible" ||
        !navigator.onLine
      )
        return;
      if (
        connectedRef.current ||
        connectionStateRef.current === "connecting"
      )
        return;
      window.location.reload();
    }, delay);
  }, []);

  useEffect(() => {
    if (!meeting) return;
    const onRoomJoined = () => {
      terminalRoomStateRef.current = false;
      setError(undefined);
      setStatus("connected", true);
      sync();
    };
    const onRoomLeft = ({ state }: { state?: string }) => {
      if (
        state === "ended" ||
        state === "kicked" ||
        state === "left" ||
        state === "rejected"
      ) {
        terminalRoomStateRef.current = true;
        setStatus("failed", false);
        return;
      }
      setStatus("connection-lost", false);
      schedulePageRecovery();
    };
    const onMediaConnection = ({ state }: { state: string }) => {
      if (state === "connected") {
        if (meeting.self.roomJoined) setStatus("connected", true);
        return;
      }
      if (state === "connecting" || state === "reconnecting") {
        setStatus("reconnecting", false);
        schedulePageRecovery(6000);
        return;
      }
      if (state === "disconnected") {
        setStatus("connection-lost", false);
        schedulePageRecovery();
        return;
      }
      if (state === "failed") {
        setStatus("failed", false);
        schedulePageRecovery(1500);
      }
    };
    const onSocketConnection = ({
      state,
      reconnected,
    }: {
      state: string;
      reconnected?: boolean;
    }) => {
      if (state === "connected" || reconnected) {
        if (meeting.self.roomJoined) setStatus("connected", true);
        return;
      }
      if (state === "reconnecting" || state === "disconnected") {
        connectionStateRef.current = "reconnecting";
        setConnectionState("reconnecting");
        schedulePageRecovery(6000);
        return;
      }
      if (state === "failed") {
        setStatus("failed", false);
        schedulePageRecovery(1500);
      }
    };

    meeting.self.on("roomJoined", onRoomJoined);
    meeting.self.on("roomLeft", onRoomLeft);
    meeting.meta.on("mediaConnectionUpdate", onMediaConnection);
    meeting.meta.on("socketConnectionUpdate", onSocketConnection);
    if (meeting.self.roomJoined) onRoomJoined();

    return () => {
      meeting.self.off("roomJoined", onRoomJoined);
      meeting.self.off("roomLeft", onRoomLeft);
      meeting.meta.off("mediaConnectionUpdate", onMediaConnection);
      meeting.meta.off("socketConnectionUpdate", onSocketConnection);
    };
  }, [meeting, schedulePageRecovery, setStatus, sync]);

  const connect = useCallback(
    async (authToken: string, deviceId?: string, _startMuted = false) => {
      if (connectingRef.current) return;
      const currentMeeting = meetingRef.current;
      if (currentMeeting?.self.roomJoined) {
        setStatus("connected", true);
        return;
      }
      connectingRef.current = true;
      try {
        terminalRoomStateRef.current = false;
        setStatus(
          connectedRef.current ? "reconnecting" : "connecting",
          false,
        );
        setError(undefined);
        if (!authToken || typeof authToken !== "string")
          throw new Error(
            "RealtimeKit auth token was not returned by the server",
          );
        if (authToken.startsWith("mock.")) {
          setParticipants([
            {
              id: authToken.slice(5),
              name: localName,
              role,
              currentRole: role,
              stageStatus: role === "audience" ? "OFF_STAGE" : "ON_STAGE",
              canUnmute: true,
              hostMuted: false,
              muted: true,
              handRaised: false,
              speaking: false,
              local: true,
            },
          ]);
          setStageStatus(role === "audience" ? "OFF_STAGE" : "ON_STAGE");
          setStatus("connected", true);
          return;
        }
        if (currentMeeting && !currentMeeting.self.roomJoined)
          await currentMeeting.leave().catch(() => undefined);
        const client = await initMeeting({
          authToken,
          defaults: { audio: false, video: false },
        });
        if (!client) throw new Error("Media initialization failed");
        meetingRef.current = client;
        if (deviceId) {
          const devices = await client.self.getAllDevices();
          const device = devices.find((item) => item.deviceId === deviceId);
          if (device) await client.self.setDevice(device);
        }
        await client.self.disableVideo();
        await client.join();
        await client.self.disableAudio();
        setStageStatus(
          normalizeStageStatus(client.stage.status ?? client.self.stageStatus),
        );
        setStatus("connected", true);
      } catch (cause) {
        console.error("RealtimeKit connection failed", cause);
        setError("Unable to connect to live audio.");
        setStatus(navigator.onLine ? "failed" : "connection-lost", false);
        schedulePageRecovery(2000);
      } finally {
        connectingRef.current = false;
      }
    },
    [initMeeting, localName, role, schedulePageRecovery, setStatus],
  );

  useEffect(() => {
    const offline = () => setStatus("connection-lost", false);
    const online = () => {
      if (!terminalRoomStateRef.current && !connectedRef.current) {
        connectionStateRef.current = "reconnecting";
        setConnectionState("reconnecting");
        schedulePageRecovery(3500);
      }
    };
    const visible = () => {
      if (
        document.visibilityState !== "visible" ||
        terminalRoomStateRef.current
      )
        return;
      if (!connectedRef.current) schedulePageRecovery(3000);
    };
    const pageShow = () => {
      if (!terminalRoomStateRef.current && !connectedRef.current)
        schedulePageRecovery(2500);
    };
    window.addEventListener("offline", offline);
    window.addEventListener("online", online);
    window.addEventListener("pageshow", pageShow);
    document.addEventListener("visibilitychange", visible);
    return () => {
      window.removeEventListener("offline", offline);
      window.removeEventListener("online", online);
      window.removeEventListener("pageshow", pageShow);
      document.removeEventListener("visibilitychange", visible);
      if (recoveryTimerRef.current !== null)
        window.clearTimeout(recoveryTimerRef.current);
    };
  }, [schedulePageRecovery, setStatus]);

  useEffect(() => {
    const nav = navigator as Navigator & { audioSession?: { type: string } };
    try {
      if (nav.audioSession) nav.audioSession.type = "play-and-record";
      if ("mediaSession" in navigator) {
        navigator.mediaSession.metadata = new MediaMetadata({
          title: "Kujua Room live session",
          artist: localName,
          album: "Kujua Room",
        });
        navigator.mediaSession.playbackState = connected ? "playing" : "none";
      }
    } catch {}
    return () => {
      try {
        if ("mediaSession" in navigator) {
          navigator.mediaSession.playbackState = "none";
          navigator.mediaSession.metadata = null;
        }
      } catch {}
    };
  }, [connected, localName]);

  const canEnableSelfAudio = useCallback(() => {
    if (!meeting) return false;
    const providerPermission = String(
      meeting.self.permissions.canProduceAudio ?? "",
    ).toUpperCase();
    const currentStage = normalizeStageStatus(
      meeting.stage.status ?? meeting.self.stageStatus,
    );
    return providerPermission === "ALLOWED" || currentStage === "ON_STAGE";
  }, [meeting]);

  const toggleAudio = useCallback(async () => {
    if (!meeting) throw new Error("Live audio is not connected.");
    if (meeting.self.audioEnabled) {
      await meeting.self.disableAudio();
      sync();
      return;
    }
    if (!canEnableSelfAudio())
      throw new Error(
        "Room audio permissions need updating. Rejoin the room after the audio settings are updated.",
      );
    await meeting.self.enableAudio();
    sync();
  }, [canEnableSelfAudio, meeting, sync]);

  const requestStageAccess = useCallback(async () => {
    if (!meeting) throw new Error("Live audio is not connected.");
    const currentStage = normalizeStageStatus(
      meeting.stage.status ?? meeting.self.stageStatus,
    );
    if (
      currentStage === "ON_STAGE" ||
      currentStage === "REQUESTED_TO_JOIN_STAGE" ||
      currentStage === "ACCEPTED_TO_JOIN_STAGE"
    )
      return false;
    const stageAccess = String(
      meeting.self.permissions.stageAccess ?? "",
    ).toUpperCase();
    if (!meeting.self.permissions.stageEnabled || stageAccess !== "CAN_REQUEST")
      return false;
    await meeting.stage.requestAccess();
    sync();
    return true;
  }, [meeting, sync]);

  const cancelStageAccessRequest = useCallback(async () => {
    if (!meeting) return;
    const currentStage = normalizeStageStatus(
      meeting.stage.status ?? meeting.self.stageStatus,
    );
    if (currentStage !== "REQUESTED_TO_JOIN_STAGE") return;
    await meeting.stage.cancelRequestAccess();
    sync();
  }, [meeting, sync]);

  const findRemoteParticipant = useCallback(
    (targetUserId: string) => {
      if (!meeting) return undefined;
      return Array.from(meeting.participants.joined.values()).find(
        (item) =>
          item.customParticipantId === targetUserId || item.id === targetUserId,
      );
    },
    [meeting],
  );

  const grantStageAccess = useCallback(
    async (targetUserId: string) => {
      if (!meeting) throw new Error("Live audio is not connected.");
      const participant = findRemoteParticipant(targetUserId);
      if (!participant)
        throw new Error("Participant is no longer connected to the live room.");
      if (!participant.userId)
        throw new Error("RealtimeKit participant user ID is unavailable.");
      const targetStage = normalizeStageStatus(participant.stageStatus);
      if (targetStage === "ON_STAGE" || targetStage === "ACCEPTED_TO_JOIN_STAGE")
        return;
      await meeting.stage.grantAccess([participant.userId]);
      sync();
    },
    [findRemoteParticipant, meeting, sync],
  );

  const denyStageAccess = useCallback(
    async (targetUserId: string) => {
      if (!meeting) return;
      const participant = findRemoteParticipant(targetUserId);
      if (!participant || !participant.userId) return;
      const targetStage = normalizeStageStatus(participant.stageStatus);
      if (targetStage !== "REQUESTED_TO_JOIN_STAGE") return;
      await meeting.stage.denyAccess([participant.userId]);
      sync();
    },
    [findRemoteParticipant, meeting, sync],
  );

  const removeStageAccess = useCallback(
    async (targetUserId: string) => {
      if (!meeting) throw new Error("Live audio is not connected.");
      const participant = findRemoteParticipant(targetUserId);
      if (!participant) return;
      if (!participant.userId)
        throw new Error("RealtimeKit participant user ID is unavailable.");
      const targetStage = normalizeStageStatus(participant.stageStatus);
      if (targetStage === "REQUESTED_TO_JOIN_STAGE") {
        await meeting.stage.denyAccess([participant.userId]);
      } else if (
        targetStage === "ON_STAGE" ||
        targetStage === "ACCEPTED_TO_JOIN_STAGE"
      ) {
        await meeting.stage.kick([participant.userId]);
      }
      sync();
    },
    [findRemoteParticipant, meeting, sync],
  );

  const joinApprovedStage = useCallback(async () => {
    if (!meeting) throw new Error("Live audio is not connected.");
    const currentStage = normalizeStageStatus(
      meeting.stage.status ?? meeting.self.stageStatus,
    );
    if (currentStage === "ON_STAGE") return;
    if (currentStage !== "ACCEPTED_TO_JOIN_STAGE")
      throw new Error("RealtimeKit speaking access has not been accepted yet.");
    await meeting.stage.join();
    await meeting.self.disableAudio();
    const joinedStage = normalizeStageStatus(
      meeting.stage.status ?? meeting.self.stageStatus,
    );
    setStageStatus(joinedStage);
    sync();
  }, [meeting, sync]);

  const muteParticipant = useCallback(
    async (targetUserId: string) => {
      if (!meeting) throw new Error("Live audio is not connected.");
      if (!meeting.self.permissions.canDisableParticipantAudio)
        throw new Error(
          "The host RealtimeKit preset does not allow muting participants.",
        );
      const participant = findRemoteParticipant(targetUserId);
      if (!participant)
        throw new Error("Participant is no longer connected.");
      await participant.disableAudio();
      sync();
    },
    [findRemoteParticipant, meeting, sync],
  );

  const muteAll = useCallback(async () => {
    if (!meeting) throw new Error("Live audio is not connected.");
    if (!meeting.self.permissions.canDisableParticipantAudio)
      throw new Error(
        "The host RealtimeKit preset does not allow muting participants.",
      );
    await meeting.participants.disableAllAudio(true);
    sync();
  }, [meeting, sync]);

  const leave = useCallback(async () => {
    terminalRoomStateRef.current = true;
    if (meeting) await meeting.leave();
    setStatus("connection-lost", false);
  }, [meeting, setStatus]);

  return {
    meeting,
    participants,
    connected,
    connectionState,
    stageStatus,
    error,
    connect,
    canEnableSelfAudio,
    toggleAudio,
    requestStageAccess,
    cancelStageAccessRequest,
    grantStageAccess,
    denyStageAccess,
    removeStageAccess,
    joinApprovedStage,
    muteParticipant,
    muteAll,
    leave,
  };
}

function normalizeStageStatus(value: unknown): RealtimeKitStageStatus {
  const normalized = String(value ?? "").toUpperCase();
  if (normalized === "ON_STAGE") return "ON_STAGE";
  if (normalized === "OFF_STAGE") return "OFF_STAGE";
  if (normalized === "REQUESTED_TO_JOIN_STAGE")
    return "REQUESTED_TO_JOIN_STAGE";
  if (normalized === "ACCEPTED_TO_JOIN_STAGE")
    return "ACCEPTED_TO_JOIN_STAGE";
  return "UNKNOWN";
}

function roleFromPreset(preset?: string): RoomRole {
  if (preset?.includes("host")) return "host";
  if (preset?.includes("moderator")) return "moderator";
  if (preset?.includes("speaker")) return "speaker";
  return "audience";
}
