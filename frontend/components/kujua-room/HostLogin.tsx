import { useState, type FormEvent } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { createClient } from "@/lib/supabase/client";
import { apiFetch } from "@/lib/api";
import { BrandMark } from "./BrandMark";

export function HostLogin() {
  const navigate = useNavigate();
  const [search] = useSearchParams();
  const access = search.get("access") === "public" ? "public" : "private";
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function submit(form: FormData) {
    setLoading(true);
    setError("");

    // Credentials still go to the server, exactly as they did through the Next
    // route. Signing in from the browser instead would move the attempt outside
    // the 8-per-15-minutes limiter and hand brute-force protection to Supabase
    // Auth's much coarser defaults. The function rate-limits, authenticates,
    // verifies host membership, and only then returns a session to adopt.
    const response = await apiFetch("/host/login", {
      method: "POST",
      body: JSON.stringify({
        email: String(form.get("email")),
        password: String(form.get("password")),
      }),
    });

    const body = (await response.json().catch(() => null)) as
      | { session?: { access_token: string; refresh_token: string }; error?: string }
      | null;

    if (!response.ok || !body?.session) {
      setError(body?.error ?? "Unable to sign in. Please try again.");
      setLoading(false);
      return;
    }

    const { error: sessionError } = await createClient().auth.setSession({
      access_token: body.session.access_token,
      refresh_token: body.session.refresh_token,
    });
    if (sessionError) {
      setError("Unable to sign in. Please try again.");
      setLoading(false);
      return;
    }

    navigate(`/host?access=${access}`);
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) { event.preventDefault(); await submit(new FormData(event.currentTarget)); }
  return <main className="join-screen"><form className="join-card" onSubmit={(event)=>void handleSubmit(event)}><div className="brand-center"><BrandMark className="lg"/></div><h1>Host sign in</h1><p className="sub">Kujua Room · Host workspace</p><label className="form-label" htmlFor="email">Email</label><input className="form-input" id="email" name="email" type="email" autoComplete="email" autoFocus required/><label className="form-label spaced" htmlFor="password">Password</label><input className="form-input" id="password" name="password" type="password" autoComplete="current-password" required/><button type="submit" className="btn primary spaced" disabled={loading}>{loading?<><i className="btn-spinner" aria-hidden="true"/>Signing in…</>:"Sign in"}</button>{error?<p className="form-error" role="alert">{error}</p>:null}</form></main>;
}
