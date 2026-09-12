import { useEffect, useRef, useState } from "react";

function secondsUntil(endsAt: string) {
  return Math.max(0, Math.ceil((new Date(endsAt).getTime() - Date.now()) / 1000));
}

/**
 * Shown to everyone once the host ends the session. The countdown is a grace
 * period for saving notes, not a choice — when it reaches zero the room closes
 * itself for every participant, and "Leave now" skips the wait.
 */
export function EndSessionOverlay({
  endsAt,
  notes,
  onEnded,
}: {
  endsAt: string;
  notes: string;
  onEnded: () => void;
}) {
  const [seconds, setSeconds] = useState(() => secondsUntil(endsAt));

  /* onEnded is an inline closure at the call site, so it changes identity on
     every render and re-runs this effect. Without the latch the re-created
     interval fires the teardown again on the very next tick, which meant
     finalize + leave were posted repeatedly once the countdown hit zero. */
  const endedRef = useRef(false);
  const onEndedRef = useRef(onEnded);
  useEffect(() => {
    onEndedRef.current = onEnded;
  });

  useEffect(() => {
    endedRef.current = false;

    const fire = () => {
      if (endedRef.current) return;
      endedRef.current = true;
      onEndedRef.current();
    };

    const tick = () => {
      const left = secondsUntil(endsAt);
      setSeconds(left);
      if (!left) fire();
    };

    tick();
    const timer = window.setInterval(tick, 250);
    return () => window.clearInterval(timer);
  }, [endsAt]);

  const leaveNow = () => {
    if (endedRef.current) return;
    endedRef.current = true;
    onEndedRef.current();
  };

  return (
    <div
      className="end-overlay"
      role="dialog"
      aria-modal="true"
      aria-labelledby="ending-title"
    >
      <div>
        <strong className="countdown">{seconds}</strong>
        <h2 id="ending-title">The host is ending the session</h2>
        <p>
          Save your notes now — the room closes for everyone when the timer
          reaches zero.
        </p>
        <textarea readOnly value={notes} aria-label="Notes ready to save" />
        <button className="btn secondary spaced" onClick={leaveNow}>
          Leave now
        </button>
      </div>
    </div>
  );
}
