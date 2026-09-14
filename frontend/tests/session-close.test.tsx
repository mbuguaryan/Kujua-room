import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { EndSessionOverlay } from "@/components/kujua-room/EndSessionOverlay";

afterEach(() => {
  // vitest runs without globals, so testing-library's auto-cleanup is not
  // registered and renders would otherwise pile up across tests.
  cleanup();
  vi.useRealTimers();
});

describe("EndSessionOverlay", () => {
  it("closes the room exactly once when the countdown reaches zero", async () => {
    vi.useFakeTimers();
    const onEnded = vi.fn();
    const endsAt = new Date(Date.now() + 1000).toISOString();

    const { rerender } = render(
      <EndSessionOverlay endsAt={endsAt} notes="" onEnded={onEnded} />,
    );

    await vi.advanceTimersByTimeAsync(1200);
    expect(onEnded).toHaveBeenCalledTimes(1);

    /* The call site passes a fresh inline closure on every render, which used
       to re-arm the interval and fire the teardown again on the next tick. */
    rerender(
      <EndSessionOverlay endsAt={endsAt} notes="" onEnded={vi.fn(onEnded)} />,
    );
    await vi.advanceTimersByTimeAsync(3000);
    expect(onEnded).toHaveBeenCalledTimes(1);
  });

  it("fires immediately for someone who joins after the countdown expired", async () => {
    vi.useFakeTimers();
    const onEnded = vi.fn();

    render(
      <EndSessionOverlay
        endsAt={new Date(Date.now() - 5000).toISOString()}
        notes=""
        onEnded={onEnded}
      />,
    );

    await vi.advanceTimersByTimeAsync(0);
    expect(onEnded).toHaveBeenCalledTimes(1);
  });

  it("lets a participant leave without waiting out the countdown", async () => {
    const user = userEvent.setup();
    const onEnded = vi.fn();

    render(
      <EndSessionOverlay
        endsAt={new Date(Date.now() + 60_000).toISOString()}
        notes="my notes"
        onEnded={onEnded}
      />,
    );

    await user.click(screen.getByRole("button", { name: "Leave now" }));
    await waitFor(() => expect(onEnded).toHaveBeenCalledTimes(1));

    // A second click must not post finalize and leave all over again.
    await user.click(screen.getByRole("button", { name: "Leave now" }));
    expect(onEnded).toHaveBeenCalledTimes(1);
  });
});
