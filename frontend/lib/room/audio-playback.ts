/** Retry browser-blocked room audio during the next user interaction. */
export function createAudioPlayback() {
  const blocked = new Set<HTMLAudioElement>();
  let disposed = false;
  const play = (audio: HTMLAudioElement) => {
    if (disposed) return;
    void audio.play().then(
      () => blocked.delete(audio),
      (cause: unknown) => {
        if (disposed || !audio.srcObject) return;
        const name =
          cause instanceof Error || cause instanceof DOMException
            ? cause.name
            : "";
        if (name === "NotAllowedError") {
          blocked.add(audio);
        } else if (name !== "AbortError") {
          console.warn("RealtimeKit remote audio playback failed", cause);
        }
      },
    );
  };
  const retry = () => {
    for (const audio of blocked) {
      if (audio.srcObject) play(audio);
      else blocked.delete(audio);
    }
  };
  document.addEventListener("click", retry);
  document.addEventListener("keydown", retry);
  return {
    play,
    dispose() {
      disposed = true;
      blocked.clear();
      document.removeEventListener("click", retry);
      document.removeEventListener("keydown", retry);
    },
  };
}
