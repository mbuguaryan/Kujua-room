import "server-only";
import { serverEnv } from "@/lib/env.server";
import { MockMediaAdapter } from "./mock";
import { RealtimeKitAdapter } from "./realtimekit";
export function mediaAdapter() {
  return serverEnv().MEDIA_ADAPTER === "mock"
    ? new MockMediaAdapter()
    : new RealtimeKitAdapter();
}
