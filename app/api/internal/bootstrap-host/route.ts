import "server-only";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const email = process.env.KUJUA_HOST_EMAIL;
  const password = process.env.KUJUA_HOST_PASSWORD;
  if (!email || !password) {
    return Response.json(
      { success: false, status: "HOST_LOGIN_VERIFICATION_FAILED" },
      { status: 503 },
    );
  }
  try {
    const login = await fetch(new URL("/api/auth/host-login", request.url), {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ email, password }),
      cache: "no-store",
    });
    const body = (await login.json()) as { ok?: boolean };
    const sessionCookieSet = Boolean(login.headers.get("set-cookie"));
    if (!login.ok || body.ok !== true || !sessionCookieSet) {
      return Response.json(
        { success: false, status: "HOST_LOGIN_VERIFICATION_FAILED" },
        { status: 500 },
      );
    }
    return Response.json({ success: true, status: "HOST_LOGIN_VERIFIED" });
  } catch {
    return Response.json(
      { success: false, status: "HOST_LOGIN_VERIFICATION_FAILED" },
      { status: 500 },
    );
  }
}
