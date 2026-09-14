/**
 * Creates (or repairs) a host account. There is no self-registration in Kujua
 * Room by design — hosts are provisioned, so signing in with an address that
 * was never bootstrapped correctly returns "Incorrect email or password".
 *
 * Runs on Deno like the Edge Functions beside it. Node would resolve
 * node_modules by walking up from backend/, which never reaches
 * frontend/node_modules.
 *
 *   deno run --allow-net --allow-env --env-file=backend/.env.local \
 *     backend/scripts/bootstrap-host.ts
 *
 * with KUJUA_HOST_EMAIL and KUJUA_HOST_PASSWORD also set.
 */
import { createClient } from "npm:@supabase/supabase-js@2.112.4";
async function main() {
  const url = Deno.env.get("SUPABASE_URL");
  const key = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  const email = Deno.env.get("KUJUA_HOST_EMAIL");
  const password = Deno.env.get("KUJUA_HOST_PASSWORD");
  if (!url || !key || !email || !password)
    throw new Error(
      "Set SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, KUJUA_HOST_EMAIL, and KUJUA_HOST_PASSWORD.",
    );
  const admin = createClient(url, key, { auth: { persistSession: false } });
  const { data: listed, error: listError } = await admin.auth.admin.listUsers({
    page: 1,
    perPage: 1000,
  });
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
  const updated = await admin.auth.admin.updateUserById(user.id, {
    password,
    email_confirm: true,
  });
  if (updated.error) throw updated.error;
  const { error: profileError } = await admin.from("profiles").upsert({
    user_id: user.id,
    display_name: user.user_metadata?.display_name ?? "Keith Muoki",
  });
  if (profileError) throw profileError;
  const { data: room, error: roomError } = await admin
    .from("rooms")
    .select("id")
    .eq("slug", "mens-conference")
    .single();
  if (roomError) throw roomError;
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
  console.info(`Host membership ready for ${email}. Password was not printed.`);
}

main().catch((error: unknown) => {
  console.error(
    error instanceof Error ? error.message : "Host bootstrap failed.",
  );
  Deno.exit(1);
});
