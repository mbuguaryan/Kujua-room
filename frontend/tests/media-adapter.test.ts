import { expect, it } from "vitest";
import { MockMediaAdapter } from "@backend/supabase/functions/_shared/media/mock.ts";
it("maps a stable user identity into mock participant tokens", async () => {
  const adapter = new MockMediaAdapter();
  const token = await adapter.addParticipant({
    meetingId: crypto.randomUUID(),
    userId: "5d875169-735c-468b-90f6-969581923a0e",
    name: "John",
    role: "audience",
  });
  expect(token.participantId).toBe("5d875169-735c-468b-90f6-969581923a0e");
  expect(token.presetName).toBe("audience");
});
