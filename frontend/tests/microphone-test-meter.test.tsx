import { act, cleanup, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { MicrophoneSetup } from "@/components/kujua-room/MicrophoneSetup";

/**
 * The level meter is driven by requestAnimationFrame writing transforms
 * straight to the DOM, so these tests own the frame clock and the analyser and
 * assert on what the bars actually do.
 */
let frames: FrameRequestCallback[] = [];
let now = 0;
let amplitude = 0;
let closed = 0;
let stopped = 0;
let contextState: AudioContextState = "running";

function drawFrames(count: number, step = 16) {
  for (let index = 0; index < count; index += 1) {
    const pending = frames;
    frames = [];
    now += step;
    for (const frame of pending) frame(now);
  }
}

function barScales() {
  return Array.from(
    document.querySelectorAll<HTMLElement>(".mic-visualizer > span"),
    (bar) => Number(/scaleY\(([\d.]+)\)/.exec(bar.style.transform)?.[1] ?? NaN),
  );
}

beforeEach(() => {
  frames = [];
  now = 0;
  amplitude = 0;
  closed = 0;
  stopped = 0;
  contextState = "running";

  vi.stubGlobal("requestAnimationFrame", (callback: FrameRequestCallback) => {
    frames.push(callback);
    return frames.length;
  });
  vi.stubGlobal("cancelAnimationFrame", () => {});

  vi.stubGlobal(
    "AudioContext",
    class {
      get state() {
        return contextState;
      }
      resume = vi.fn(async () => {
        contextState = "running";
      });
      close = vi.fn(async () => {
        closed += 1;
      });
      createAnalyser = () => ({
        fftSize: 2048,
        getByteTimeDomainData: (target: Uint8Array) => {
          // A flat 128 is digital silence; deviation from it is signal.
          target.fill(128);
          target[0] = 128 + amplitude;
        },
      });
      createMediaStreamSource = () => ({
        connect: vi.fn(),
        disconnect: vi.fn(),
      });
    },
  );

  Object.defineProperty(navigator, "mediaDevices", {
    configurable: true,
    value: {
      getUserMedia: vi.fn(async () => ({
        getTracks: () => [{ stop: () => (stopped += 1) }],
      })),
      enumerateDevices: vi.fn(async () => []),
    },
  });
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

async function startTest() {
  render(<MicrophoneSetup onDeviceChange={() => {}} />);
  await act(async () => {
    screen.getByRole("button", { name: /test microphone/i }).click();
  });
}

describe("microphone test meter", () => {
  it("starts listening and offers a way to stop", async () => {
    await startTest();
    expect(screen.getByText(/Listening/)).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: /stop test/i }),
    ).toBeInTheDocument();
  });

  it("drives the bars from the input level and confirms the mic works", async () => {
    await startTest();

    const resting = barScales();
    expect(resting.every((scale) => scale > 0 && scale < 0.15)).toBe(true);

    amplitude = 90;
    await act(async () => drawFrames(12));

    const loud = barScales();
    expect(loud.every((scale) => scale > resting[0])).toBe(true);
    // The centre bar leads, so the shape reads as a voice, not a flat block.
    expect(loud[4]).toBeGreaterThan(loud[0]);
    expect(screen.getByText("Your microphone is working.")).toBeInTheDocument();
  });

  it("falls back towards rest when the input goes quiet", async () => {
    await startTest();

    amplitude = 90;
    await act(async () => drawFrames(12));
    const loud = barScales()[4];

    amplitude = 0;
    await act(async () => drawFrames(40));
    expect(barScales()[4]).toBeLessThan(loud);
  });

  it("keeps the bars at rest while the input is silent", async () => {
    await startTest();
    await act(async () => drawFrames(20));
    expect(barScales().every((scale) => scale < 0.15)).toBe(true);
    expect(screen.getByText(/Listening/)).toBeInTheDocument();
  });

  it("releases the microphone when the test is stopped", async () => {
    await startTest();
    await act(async () => {
      screen.getByRole("button", { name: /stop test/i }).click();
    });

    expect(stopped).toBe(1);
    expect(closed).toBe(1);
    expect(
      screen.getByRole("button", { name: /test microphone/i }),
    ).toBeInTheDocument();
    expect(screen.queryByText(/Listening/)).toBeNull();
  });

  it("keeps the confirmation after a successful test is stopped", async () => {
    await startTest();
    amplitude = 90;
    await act(async () => drawFrames(12));

    await act(async () => {
      screen.getByRole("button", { name: /stop test/i }).click();
    });

    expect(screen.getByText("Your microphone is working.")).toBeInTheDocument();
  });

  it("explains a blocked microphone instead of showing a dead meter", async () => {
    navigator.mediaDevices.getUserMedia = vi.fn(async () => {
      throw new DOMException("Permission denied", "NotAllowedError");
    });

    await startTest();

    expect(screen.getByText(/Microphone blocked/)).toBeInTheDocument();
    // The context opened for the gesture must not be left running.
    expect(closed).toBe(1);
  });

  it("resumes a context the browser started suspended", async () => {
    contextState = "suspended";
    await startTest();

    amplitude = 90;
    await act(async () => drawFrames(12));
    expect(screen.getByText("Your microphone is working.")).toBeInTheDocument();
  });
});

it.each(["stop", "unmount"])(
  "releases a late permission result after %s",
  async (action) => {
    let resolveStream!: (stream: MediaStream) => void;
    navigator.mediaDevices.getUserMedia = vi.fn(
      () =>
        new Promise<MediaStream>((resolve) => {
          resolveStream = resolve;
        }),
    );
    const view = render(<MicrophoneSetup onDeviceChange={() => {}} />);
    await act(async () =>
      screen.getByRole("button", { name: /test microphone/i }).click(),
    );
    await act(async () => {
      if (action === "stop")
        screen.getByRole("button", { name: /stop test/i }).click();
      else view.unmount();
    });
    await act(async () =>
      resolveStream({
        getTracks: () => [{ stop: () => (stopped += 1) }],
      } as unknown as MediaStream),
    );
    expect(stopped).toBe(1);
    expect(closed).toBe(1);
    expect(frames).toHaveLength(0);
    expect(screen.queryByText(/Listening/)).toBeNull();
  },
);

it.each([
  ["NotFoundError", /Microphone not found/],
  ["OverconstrainedError", /Microphone not found/],
  ["NotReadableError", /Microphone could not start/],
])("explains %s without blaming permissions", async (name, message) => {
  navigator.mediaDevices.getUserMedia = vi
    .fn()
    .mockRejectedValue(new DOMException("Failed", name));
  await startTest();
  expect(screen.getByText(message)).toBeInTheDocument();
  expect(closed).toBe(1);
});

it("clears an old microphone confirmation when the selected device changes", async () => {
  const view = render(
    <MicrophoneSetup selectedDeviceId="first" onDeviceChange={() => {}} />,
  );
  await act(async () =>
    screen.getByRole("button", { name: /test microphone/i }).click(),
  );
  amplitude = 90;
  await act(async () => drawFrames(12));
  expect(screen.getByText("Your microphone is working.")).toBeInTheDocument();
  view.rerender(
    <MicrophoneSetup selectedDeviceId="second" onDeviceChange={() => {}} />,
  );
  expect(stopped).toBe(1);
  expect(screen.queryByText("Your microphone is working.")).toBeNull();
  expect(
    screen.getByRole("button", { name: /test microphone/i }),
  ).toBeInTheDocument();
});
