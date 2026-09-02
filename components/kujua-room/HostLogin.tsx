"use client";
import { useState, type FormEvent } from "react";
import { useRouter, useSearchParams } from "next/navigation";
export function HostLogin() {
  const router = useRouter();
  const search = useSearchParams();
  const access = search.get("access") === "public" ? "public" : "private";
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  async function submit(form: FormData) {
    setLoading(true);
    setError("");
    const response = await fetch("/api/auth/host-login", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ email: String(form.get("email")), password: String(form.get("password")) }),
    });
    if (!response.ok) {
      const body = (await response.json().catch(() => null)) as { error?: string } | null;
      setError(body?.error ?? "Unable to sign in. Please try again.");
      setLoading(false);
      return;
    }
    router.push(`/host?access=${access}`);
  }
  async function handleSubmit(event: FormEvent<HTMLFormElement>) { event.preventDefault(); await submit(new FormData(event.currentTarget)); }
  return <main className="join-screen"><form className="join-card" onSubmit={(event)=>void handleSubmit(event)}><div className="brand-center"><div className="brand-mark">K</div></div><h1>Host sign in</h1><p className="sub">Kujua Room · Host workspace</p><label className="form-label" htmlFor="email">Email</label><input className="form-input" id="email" name="email" type="email" autoComplete="email" required/><label className="form-label spaced" htmlFor="password">Password</label><input className="form-input" id="password" name="password" type="password" autoComplete="current-password" required/><button type="submit" className="btn primary spaced" disabled={loading}>{loading?"Signing in…":"Sign in"}</button>{error?<p className="form-error" role="alert">{error}</p>:null}</form></main>;
}
