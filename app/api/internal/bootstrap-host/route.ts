import "server-only";
import { createClient } from "@supabase/supabase-js";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function response(success: boolean, status: string, httpStatus = 200) {
  return Response.json({ success, status }, { status: httpStatus });
}

export async function POST() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const publishableKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const email = process.env.KUJUA_HOST_EMAIL;
  const password = process.env.KUJUA_HOST_PASSWORD;
  if (!url || !publishableKey || !serviceRoleKey || !email || !password) {
    return response(false, "HOST_PASSWORD_SYNC_FAILED", 503);
  }

  try {
    const admin = createClient(url, serviceRoleKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
    const { data: listed, error: listError } =
      await admin.auth.admin.listUsers({ page: 1, perPage: 1000 });
    if (listError) throw listError;
    const user = listed.users.find(
      (candidate) => candidate.email?.toLowerCase() === email.toLowerCase(),
    );
    if (!user) return response(false, "HOST_PASSWORD_SYNC_FAILED", 404);

    const { error: updateError } = await admin.auth.admin.updateUserById(
      user.id,
      { password, email_confirm: true },
    );
    if (updateError) throw updateError;

    const { data: room, error: roomError } = await admin
      .from("rooms")
      .select("id")
      .eq("slug", "mens-conference")
      .single();
    if (roomError) throw roomError;
    const { error: profileError } = await admin.from("profiles").upsert({
      user_id: user.id,
      display_name: user.user_metadata?.display_name ?? "Keith Muoki",
    });
    if (profileError) throw profileError;
    const { error: membershipError } = await admin.from("room_members").upsert(
      {
        room_id: room.id,
        user_id: user.id,
        role: "host",
        status: "active",
      },
      { onConflict: "room_id,user_id" },
    );
    if (membershipError) throw membershipError;

    const verifier = createClient(url, publishableKey, {
      auth: {
        persistSession: false,
        autoRefreshToken: false,
        detectSessionInUrl: false,
      },
    });
    const { data: verified, error: verifyError } =
      await verifier.auth.signInWithPassword({ email, password });
    if (verifyError || verified.user?.id !== user.id) {
      return response(false, "HOST_PASSWORD_AUTH_FAILED", 500);
    }
    await verifier.auth.signOut({ scope: "local" });
    return response(true, "HOST_PASSWORD_SYNCED");
  } catch {
    return response(false, "HOST_PASSWORD_SYNC_FAILED", 500);
  }
}
