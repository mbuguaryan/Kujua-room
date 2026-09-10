import { serverEnv } from "../env.ts";
import { MockMediaAdapter } from "./mock.ts";
import { RealtimeKitAdapter } from "./realtimekit.ts";

/** MEDIA_ADAPTER=mock keeps the whole app clickable without Cloudflare credentials. */
export function mediaAdapter() {
  return serverEnv().MEDIA_ADAPTER === "mock"
    ? new MockMediaAdapter()
    : new RealtimeKitAdapter();
}
