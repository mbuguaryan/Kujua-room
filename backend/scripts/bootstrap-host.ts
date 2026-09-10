import { createClient } from "@supabase/supabase-js";
async function main() {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const email = process.env.KUJUA_HOST_EMAIL;
  const password = process.env.KUJUA_HOST_PASSWORD;
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
  process.exitCode = 1;
});
