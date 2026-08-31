import "server-only";
import { z } from "zod";

const schema = z.object({
  NEXT_PUBLIC_SUPABASE_URL: z.string().url(),
  NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: z.string().min(20),
  NEXT_PUBLIC_APP_URL: z.string().url().default("http://localhost:3000"),
  SUPABASE_SERVICE_ROLE_KEY: z.string().min(20).optional(),
  CLOUDFLARE_ACCOUNT_ID: z.string().min(1).optional(),
  CLOUDFLARE_REALTIMEKIT_APP_ID: z.string().min(1).optional(),
  CLOUDFLARE_API_TOKEN: z.string().min(1).optional(),
  CLOUDFLARE_RTK_HOST_PRESET: z.string().default("host"),
  CLOUDFLARE_RTK_MODERATOR_PRESET: z.string().default("moderator"),
  CLOUDFLARE_RTK_SPEAKER_PRESET: z.string().default("speaker"),
  CLOUDFLARE_RTK_AUDIENCE_PRESET: z.string().default("audience"),
  MEDIA_ADAPTER: z.enum(["realtimekit", "mock"]).default("realtimekit"),
});
export const serverEnv = () => schema.parse(process.env);
