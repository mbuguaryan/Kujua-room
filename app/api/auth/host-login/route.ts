import { NextResponse } from "next/server";
import { headers } from "next/headers";
import { createClient } from "@/lib/supabase/server";
import { apiError } from "@/lib/security/http";
import { rateLimit } from "@/lib/security/rate-limit";
import { hostLoginSchema } from "@/lib/validation/schemas";

export const runtime = "nodejs";

export async function POST(request: Request) {
  try {
    const input = hostLoginSchema.parse(await request.json());
    const requestHeaders = await headers();
    const forwarded = requestHeaders
      .get("x-forwarded-for")
      ?.split(",")[0]
      ?.trim();
    await rateLimit(
      "host-login",
      `${forwarded ?? "unknown"}:${input.email.toLowerCase()}`,
      8,
      15 * 60,
    );
    const supabase = await createClient();
    const { error } = await supabase.auth.signInWithPassword(input);
    if (error) {
      return NextResponse.json(
        { error: "Unable to sign in. Check your credentials and try again." },
        { status: 401 },
      );
    }
    return NextResponse.json({ ok: true });
  } catch (error) {
    return apiError(error, "host_login_failed");
  }
}
