import { useCallback, useEffect, useRef, useState } from "react";

type TestState =
  | "idle"
  | "starting"
  | "listening"
  | "working"
  | "denied"
  | "unavailable"
  | "missing"
  | "busy"
  /** Test stopped, but it had already proved the microphone works. */
  | "confirmed";

const BAR_COUNT = 9;
/* Centre bars lead the movement so the group reads as a voice rather than a
   row of independent sliders. */
const BAR_WEIGHTS = [0.34, 0.55, 0.78, 0.93, 1, 0.93, 0.78, 0.55, 0.34];
const RESTING_SCALE = 0.09;
/** Peak level that counts as "someone actually spoke", not room hiss. */
const SPEAKING_LEVEL = 0.12;

function MicGlyph() {
  return (
    <svg
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
    >
      <rect x="9" y="2" width="6" height="12" rx="3" />
      <path d="M5 10a7 7 0 0 0 14 0M12 17v5M8 22h8" />
    </svg>
  );
}

export function MicrophoneSetup({
  selectedDeviceId,
  onDeviceChange,
}: {
  selectedDeviceId?: string;
  onDeviceChange: (id: string) => void;
}) {
  const [devices, setDevices] = useState<MediaDeviceInfo[]>([]);
  const [state, setState] = useState<TestState>("idle");
  /* Only for the screen-reader readout — the bars themselves are animated by
     writing transforms straight to the DOM, so a 60fps meter never re-renders
     the join form. */
  const [announcedLevel, setAnnouncedLevel] = useState(0);
  /* Once a microphone has proved itself, say so even after the test stops —
     losing the confirmation the moment you stop listening is worse than not
     having tested at all. */
  const [everWorked, setEverWorked] = useState(false);

  const barsRef = useRef<(HTMLSpanElement | null)[]>([]);
  const stopRef = useRef<() => void>(() => {});

  const resetBars = useCallback(() => {
    for (const bar of barsRef.current)
      if (bar) bar.style.transform = `scaleY(${RESTING_SCALE})`;
  }, []);

  /** Releases the device and parks the bars. Leaves the state text alone, so
      test() can restart cleanly without flashing through "idle". */
  const release = useCallback(() => {
    stopRef.current();
    stopRef.current = () => {};
    resetBars();
    setAnnouncedLevel(0);
  }, [resetBars]);

  const stopTest = useCallback(() => {
    release();
    setState(everWorked ? "confirmed" : "idle");
  }, [everWorked, release]);

  const [testedDeviceId, setTestedDeviceId] = useState(selectedDeviceId);
  if (testedDeviceId !== selectedDeviceId) {
    setTestedDeviceId(selectedDeviceId);
    setEverWorked(false);
    setState("idle");
    setAnnouncedLevel(0);
  }

  useEffect(() => {
    resetBars();
    return () => stopRef.current();
  }, [resetBars, selectedDeviceId]);

  const test = useCallback(async () => {
    release();

    if (!navigator.mediaDevices?.getUserMedia) {
      setState("unavailable");
      return;
    }

    setState("starting");

    /* Constructed before the first await, while the click is still the current
       user gesture. A context created after awaiting the permission prompt can
       be born suspended and then refuse to resume, and because an analyser on
       a suspended context only ever reports silence, the meter would sit dead
       at zero with nothing to tell the user why. */
    let context: AudioContext;
    try {
      context = new AudioContext();
    } catch {
      setState("unavailable");
      return;
    }
    let cancelled = false;
    let stream: MediaStream | undefined;
    let source: MediaStreamAudioSourceNode | undefined;
    let frame = 0;
    stopRef.current = () => {
      if (cancelled) return;
      cancelled = true;
      cancelAnimationFrame(frame);
      source?.disconnect();
      void context.close().catch(() => {});
      stream?.getTracks().forEach((track) => track.stop());
    };

    try {
      stream = await navigator.mediaDevices.getUserMedia({
        video: false,
        audio: selectedDeviceId
          ? { deviceId: { exact: selectedDeviceId } }
          : true,
      });
    } catch (cause) {
      if (cancelled) return;
      release();
      const name =
        cause instanceof Error || cause instanceof DOMException
          ? cause.name
          : "";
      setState(
        name === "NotFoundError" || name === "OverconstrainedError"
          ? "missing"
          : name === "NotReadableError" || name === "AbortError"
            ? "busy"
            : "denied",
      );
      return;
    }
    if (cancelled) {
      stream.getTracks().forEach((track) => track.stop());
      return;
    }

    setState("listening");

    try {
      const inputs = (await navigator.mediaDevices.enumerateDevices()).filter(
        (device) => device.kind === "audioinput",
      );
      if (!cancelled) setDevices(inputs);
    } catch {
      // Labels are a nicety; the test itself still works without the list.
    }

    if (cancelled) return;
    try {
      if (context.state === "suspended") await context.resume();
      if (cancelled) return;

      const analyser = context.createAnalyser();
      analyser.fftSize = 1024;
      source = context.createMediaStreamSource(stream);
      source.connect(analyser);

      const samples = new Uint8Array(analyser.fftSize);
      let smoothed = 0;
      let lastAnnounced = 0;

      const tick = (now: number) => {
        if (cancelled) return;
        frame = requestAnimationFrame(tick);

        analyser.getByteTimeDomainData(samples);
        let peak = 0;
        for (const sample of samples) {
          const deviation = Math.abs(sample - 128);
          if (deviation > peak) peak = deviation;
        }
        const target = Math.min(1, (peak / 128) * 2.4);

        /* Fast attack, slow release: the bars jump on a syllable and fall back
         gently, which is what makes a meter look alive instead of jittery. */
        smoothed += (target - smoothed) * (target > smoothed ? 0.5 : 0.12);

        const seconds = now / 1000;
        for (let index = 0; index < BAR_COUNT; index += 1) {
          const bar = barsRef.current[index];
          if (!bar) continue;
          const ripple = 0.78 + 0.22 * Math.sin(seconds * 7 + index * 0.7);
          const scale =
            RESTING_SCALE +
            smoothed * BAR_WEIGHTS[index] * ripple * (1 - RESTING_SCALE);
          bar.style.transform = `scaleY(${scale.toFixed(3)})`;
        }

        if (target > SPEAKING_LEVEL) {
          setState("working");
          setEverWorked(true);
        }

        // Throttled so the aria-live readout does not fire every frame.
        if (now - lastAnnounced > 400) {
          lastAnnounced = now;
          setAnnouncedLevel(Math.round(smoothed * 100));
        }
      };

      frame = requestAnimationFrame(tick);
    } catch {
      if (cancelled) return;
      release();
      setState("unavailable");
    }
  }, [release, selectedDeviceId]);

  const testing =
    state === "starting" || state === "listening" || state === "working";

  const status = {
    idle: "Check your microphone before joining.",
    starting: "Waiting for microphone permission…",
    listening: "Listening — say something to see the level move.",
    working: "Your microphone is working.",
    denied: "Microphone blocked. Allow access in your browser, then try again.",
    unavailable: "This browser cannot open a microphone.",
    missing:
      "Microphone not found. Reconnect it or choose another microphone, then try again.",
    busy: "Microphone could not start. Close other apps using it, then try again.",
    confirmed: "Your microphone is working.",
  }[state];

  return (
    <div className="mic-setup" data-state={state}>
      {devices.length > 1 ? (
        <>
          <label className="form-label" htmlFor="microphone">
            Microphone
          </label>
          <select
            id="microphone"
            className="form-input"
            value={selectedDeviceId ?? ""}
            onChange={(event) => onDeviceChange(event.target.value)}
          >
            <option value="">System default</option>
            {devices.map((device) => (
              <option key={device.deviceId} value={device.deviceId}>
                {device.label || "Microphone"}
              </option>
            ))}
          </select>
        </>
      ) : null}

      <div className="mic-test">
        <button
          className="mic-test-button"
          type="button"
          onClick={() => (testing ? stopTest() : void test())}
        >
          <MicGlyph />
          {testing ? "Stop test" : "Test microphone"}
        </button>

        <div className="mic-visualizer" aria-hidden="true">
          {Array.from({ length: BAR_COUNT }, (_, index) => (
            <span
              key={index}
              ref={(node) => {
                barsRef.current[index] = node;
              }}
            />
          ))}
        </div>
      </div>

      <p className="mic-test-status" role="status">
        {status}
        {testing ? (
          <span className="visually-hidden">
            {` Input level ${announcedLevel}%.`}
          </span>
        ) : null}
      </p>
    </div>
  );
}
