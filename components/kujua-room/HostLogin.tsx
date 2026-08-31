"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
export function HostLogin() {
  const router = useRouter();
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  async function submit(form: FormData) {
    setLoading(true);
    setError("");
    const response = await fetch("/api/auth/host-login", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        email: String(form.get("email")),
        password: String(form.get("password")),
      }),
    });
    if (!response.ok) {
      setError("Unable to sign in. Check your credentials and try again.");
      setLoading(false);
      return;
    }
    router.push("/r/mens-conference?host=1");
  }
  return (
    <main className="join-screen">
      <form className="join-card" action={(data) => void submit(data)}>
        <div className="brand-center">
          <div className="brand-mark">K</div>
        </div>
        <h1>Host sign in</h1>
        <p className="sub">Kujua Room · Men&apos;s Conference</p>
        <label className="form-label" htmlFor="email">
          Email
        </label>
        <input
          className="form-input"
          id="email"
          name="email"
          type="email"
          autoComplete="email"
          required
        />
        <label className="form-label spaced" htmlFor="password">
          Password
        </label>
        <input
          className="form-input"
          id="password"
          name="password"
          type="password"
          autoComplete="current-password"
          required
        />
        <button className="btn primary spaced" disabled={loading}>
          {loading ? "Signing in…" : "Sign in"}
        </button>
        {error ? (
          <p className="form-error" role="alert">
            {error}
          </p>
        ) : null}
      </form>
    </main>
  );
}
