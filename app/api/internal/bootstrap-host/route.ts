import "server-only";
import { createClient } from "@supabase/supabase-js";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type BootstrapStatus =
  | "HOST_ALREADY_BOOTSTRAPPED"
  | "HOST_BOOTSTRAPPED"
  | "HOST_BOOTSTRAP_FAILED";

function result(success: boolean, status: BootstrapStatus, httpStatus = 200) {
  return Response.json({ success, status }, { status: httpStatus });
}

export async function POST() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const email = process.env.KUJUA_HOST_EMAIL;
  const password = process.env.KUJUA_HOST_PASSWORD;

  if (!url || !serviceRoleKey || !email || !password) {
    return result(false, "HOST_BOOTSTRAP_FAILED", 503);
  }

  try {
    const admin = createClient(url, serviceRoleKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
    const { data: room, error: roomError } = await admin
      .from("rooms")
      .select("id")
      .eq("slug", "mens-conference")
      .single();
    if (roomError) throw roomError;

    const { count, error: hostError } = await admin
      .from("room_members")
      .select("user_id", { count: "exact", head: true })
      .eq("room_id", room.id)
      .eq("role", "host")
      .eq("status", "active");
    if (hostError) throw hostError;
    if ((count ?? 0) > 0) {
      return result(true, "HOST_ALREADY_BOOTSTRAPPED");
    }

    const { data: listed, error: listError } =
      await admin.auth.admin.listUsers({ page: 1, perPage: 1000 });
    if (listError) throw listError;
    let user = listed.users.find(
      (candidate) => candidate.email?.toLowerCase() === email.toLowerCase(),
    );
    if (!user) {
      const created = await admin.auth.admin.createUser({
        email,
        password,
        email_confirm: true,
      });
      if (created.error) throw created.error;
      user = created.data.user;
    }

    const { error: profileError } = await admin.from("profiles").upsert({
      user_id: user.id,
      display_name: user.user_metadata?.display_name ?? "Keith Muoki",
    });
    if (profileError) throw profileError;

    const { error: memberError } = await admin.from("room_members").upsert(
      {
        room_id: room.id,
        user_id: user.id,
        role: "host",
        status: "active",
      },
      { onConflict: "room_id,user_id" },
    );
    if (memberError) throw memberError;

    return result(true, "HOST_BOOTSTRAPPED");
  } catch {
    return result(false, "HOST_BOOTSTRAP_FAILED", 500);
  }
}
