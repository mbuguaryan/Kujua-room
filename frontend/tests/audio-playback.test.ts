import { afterEach, expect, it, vi } from "vitest";
import { createAudioPlayback } from "@/lib/room/audio-playback";

afterEach(() => vi.restoreAllMocks());

it("retries blocked audio on interaction and stops retrying after success", async () => {
  const audio = document.createElement("audio");
  Object.defineProperty(audio, "srcObject", { value: {}, writable: true });
  const play = vi
    .spyOn(audio, "play")
    .mockRejectedValueOnce(new DOMException("Blocked", "NotAllowedError"))
    .mockResolvedValue(undefined);
  const playback = createAudioPlayback();
  try {
    playback.play(audio);
    await Promise.resolve();
    document.dispatchEvent(new MouseEvent("click"));
    await Promise.resolve();
    expect(play).toHaveBeenCalledTimes(2);
    document.dispatchEvent(new KeyboardEvent("keydown"));
    expect(play).toHaveBeenCalledTimes(2);
  } finally {
    playback.dispose();
  }
});

it("does not retry detached audio or retain listeners after cleanup", async () => {
  const audio = document.createElement("audio");
  Object.defineProperty(audio, "srcObject", { value: {}, writable: true });
  const play = vi
    .spyOn(audio, "play")
    .mockRejectedValue(new DOMException("Blocked", "NotAllowedError"));
  const playback = createAudioPlayback();
  playback.play(audio);
  await Promise.resolve();
  audio.srcObject = null;
  document.dispatchEvent(new MouseEvent("click"));
  expect(play).toHaveBeenCalledTimes(1);
  playback.dispose();
  document.dispatchEvent(new KeyboardEvent("keydown"));
  expect(play).toHaveBeenCalledTimes(1);
});
