import { NextResponse } from "next/server";
import { headers } from "next/headers";
import { createHash } from "node:crypto";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { HttpError } from "@/lib/security/auth";
import { apiError } from "@/lib/security/http";
import { hostLoginSchema } from "@/lib/validation/schemas";

export const runtime = "nodejs";

async function enforceHostLoginRateLimit(subject: string) {
  const admin = createAdminClient();
  const rateKey = createHash("sha256").update(subject).digest("hex");
  const bucket = "host-login";
  const now = new Date();
  const { data, error } = await admin
    .from("rate_limits")
    .select("hit_count,window_started_at")
    .eq("rate_key", rateKey)
    .eq("bucket", bucket)
    .maybeSingle();
  if (error) throw error;
  if (!data) {
    const { error: insertError } = await admin.from("rate_limits").insert({
      rate_key: rateKey,
      bucket,
      window_started_at: now.toISOString(),
      hit_count: 1,
    });
    if (insertError) throw insertError;
    return;
  }
  const windowExpired =
    new Date(data.window_started_at).getTime() + 15 * 60 * 1000 <=
    now.getTime();
  if (windowExpired) {
    const { error: resetError } = await admin
      .from("rate_limits")
      .update({
        window_started_at: now.toISOString(),
        hit_count: 1,
        updated_at: now.toISOString(),
      })
      .eq("rate_key", rateKey)
      .eq("bucket", bucket);
    if (resetError) throw resetError;
    return;
  }
  if (data.hit_count >= 8) {
    throw new HttpError(429, "Too many sign-in attempts.");
  }
  const { error: updateError } = await admin
    .from("rate_limits")
    .update({ hit_count: data.hit_count + 1, updated_at: now.toISOString() })
    .eq("rate_key", rateKey)
    .eq("bucket", bucket);
  if (updateError) throw updateError;
}

export async function POST(request: Request) {
  try {
    const input = hostLoginSchema.parse(await request.json());
    const requestHeaders = await headers();
    const forwarded = requestHeaders
      .get("x-forwarded-for")
      ?.split(",")[0]
      ?.trim();
    await enforceHostLoginRateLimit(
      `${forwarded ?? "unknown"}:${input.email.toLowerCase()}`,
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
