import { NextResponse } from "next/server";
import { headers } from "next/headers";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { HttpError } from "@/lib/security/auth";
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
    const { data, error } = await supabase.auth.signInWithPassword(input);
    if (error || !data.user) {
      return NextResponse.json(
        { error: "Incorrect email or password." },
        { status: 401 },
      );
    }
    const admin = createAdminClient();
    const { data: room, error: roomError } = await admin
      .from("rooms")
      .select("id")
      .eq("slug", "mens-conference")
      .single();
    if (roomError) throw roomError;
    const { data: membership, error: membershipError } = await admin
      .from("room_members")
      .select("role,status")
      .eq("room_id", room.id)
      .eq("user_id", data.user.id)
      .maybeSingle();
    if (membershipError) throw membershipError;
    if (
      !membership ||
      membership.role !== "host" ||
      membership.status !== "active"
    ) {
      await supabase.auth.signOut({ scope: "local" });
      return NextResponse.json(
        { error: "This account is not authorized as the host of this room." },
        { status: 403 },
      );
    }
    return NextResponse.json({ ok: true });
  } catch (error) {
    if (error instanceof HttpError && error.status === 429) {
      return NextResponse.json(
        { error: "Too many sign-in attempts. Please try again later." },
        { status: 429 },
      );
    }
    return apiError(error, "host_login_failed");
  }
}
