import { useEffect } from "react";
import { apiFetch } from "@/lib/api";

type VoiceActivityMeeting = {
  self: {
    audioEnabled: boolean;
    audioTrack?: MediaStreamTrack | null;
    on: (event: "audioUpdate", handler: () => void) => void;
    off: (event: "audioUpdate", handler: () => void) => void;
  };
  participants: {
    active: {
      toArray: () => Array<{ audioEnabled?: boolean }>;
    };
    on: (event: "activeSpeaker", handler: () => void) => void;
    off: (event: "activeSpeaker", handler: () => void) => void;
  };
};

const REPORT_THROTTLE_MS = 10_000;
const LOCAL_SAMPLE_MS = 750;
const REMOTE_POLL_MS = 5_000;
const LOCAL_VOICE_RMS_THRESHOLD = 0.035;
const RECENT_VOICE_WINDOW_MS = 30_000;

export function useVoiceActivityReporter({
  sessionId,
  meeting,
  connected,
  enabled,
}: {
  sessionId: string;
  meeting: unknown;
  connected: boolean;
  enabled: boolean;
}) {
  useEffect(() => {
    if (!connected || !enabled || !meeting) return;

    const liveMeeting = meeting as VoiceActivityMeeting;
    let stopped = false;
    let lastReportedAt = 0;
    let lastVoiceObservedAt = 0;
    let localSampleTimer: number | undefined;
    let audioContext: AudioContext | null = null;
    let source: MediaStreamAudioSourceNode | null = null;
    let analyser: AnalyserNode | null = null;
    let timeDomain: Uint8Array<ArrayBuffer> | null = null;

    const report = (force = false) => {
      if (stopped) return;
      const now = Date.now();
      if (!force && now - lastReportedAt < REPORT_THROTTLE_MS) return;
      lastReportedAt = now;
      void apiFetch(`/sessions/${sessionId}/voice-activity`, {
        method: "POST",
        keepalive: true,
      }).catch(() => undefined);
    };

    const observeVoice = () => {
      lastVoiceObservedAt = Date.now();
      report();
    };

    const stopLocalAnalyser = () => {
      if (localSampleTimer) window.clearInterval(localSampleTimer);
      localSampleTimer = undefined;
      source?.disconnect();
      source = null;
      analyser = null;
      timeDomain = null;
      if (audioContext) void audioContext.close().catch(() => undefined);
      audioContext = null;
    };

    const startLocalAnalyser = () => {
      stopLocalAnalyser();
      const track = liveMeeting.self.audioTrack;
      if (!liveMeeting.self.audioEnabled || !track || track.readyState !== "live") return;

      try {
        audioContext = new AudioContext();
        source = audioContext.createMediaStreamSource(new MediaStream([track]));
        analyser = audioContext.createAnalyser();
        analyser.fftSize = 512;
        source.connect(analyser);
        timeDomain = new Uint8Array(analyser.fftSize);
        void audioContext.resume().catch(() => undefined);

        localSampleTimer = window.setInterval(() => {
          if (!analyser || !timeDomain || !liveMeeting.self.audioEnabled) return;
          analyser.getByteTimeDomainData(timeDomain);
          let squareSum = 0;
          for (const sample of timeDomain) {
            const normalized = (sample - 128) / 128;
            squareSum += normalized * normalized;
          }
          const rms = Math.sqrt(squareSum / timeDomain.length);
          if (rms >= LOCAL_VOICE_RMS_THRESHOLD) observeVoice();
        }, LOCAL_SAMPLE_MS);
      } catch {
        stopLocalAnalyser();
      }
    };

    const hasRemoteVoice = () =>
      liveMeeting.participants.active
        .toArray()
        .some((participant) => participant.audioEnabled !== false);

    const onLocalAudioUpdate = () => startLocalAnalyser();
    const onRemoteSpeaker = () => observeVoice();
    const onVisibilityChange = () => {
      if (document.visibilityState === "hidden") {
        // If real voice was observed immediately before backgrounding, flush one
        // final keepalive report before the browser can freeze JavaScript.
        if (Date.now() - lastVoiceObservedAt <= RECENT_VOICE_WINDOW_MS) report(true);
        return;
      }
      // On resume, immediately reconcile remote activity instead of waiting for
      // the next poll interval. This also cancels an inactivity countdown if
      // voice resumed while the page was being restored.
      if (hasRemoteVoice()) observeVoice();
      if (liveMeeting.self.audioEnabled) startLocalAnalyser();
    };

    liveMeeting.self.on("audioUpdate", onLocalAudioUpdate);
    liveMeeting.participants.on("activeSpeaker", onRemoteSpeaker);
    document.addEventListener("visibilitychange", onVisibilityChange);
    startLocalAnalyser();

    const remotePollTimer = window.setInterval(() => {
      if (hasRemoteVoice()) observeVoice();
    }, REMOTE_POLL_MS);

    return () => {
      stopped = true;
      liveMeeting.self.off("audioUpdate", onLocalAudioUpdate);
      liveMeeting.participants.off("activeSpeaker", onRemoteSpeaker);
      document.removeEventListener("visibilitychange", onVisibilityChange);
      if (remotePollTimer) window.clearInterval(remotePollTimer);
      stopLocalAnalyser();
    };
  }, [connected, enabled, meeting, sessionId]);
}
