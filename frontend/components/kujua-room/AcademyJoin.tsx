import { useEffect, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { createClient } from "@/lib/supabase/client";
import { apiFetch } from "@/lib/api";

type Redeem = { data?: {
  slug: string; role: "host" | "audience"; displayName: string;
  session: { access_token: string; refresh_token: string };
}; error?: string };

export function AcademyJoin() {
  const [search] = useSearchParams();
  const navigate = useNavigate();
  const token = search.get("token") ?? "";
  const [error, setError] = useState(token ? "" : "The classroom link is missing.");
  useEffect(() => {
    if (!token) return;
    let cancelled = false;
    void apiFetch("/academy-bridge/redeem", {
      method: "POST", body: JSON.stringify({ token }),
    }).then(async (response) => {
      const body = await response.json() as Redeem;
      if (!response.ok || !body.data) throw new Error(body.error ?? "The classroom link is invalid.");
      const { error: authError } = await createClient().auth.setSession(body.data.session);
      if (authError) throw authError;
      if (!cancelled) navigate(`/r/${body.data.slug}?name=${encodeURIComponent(body.data.displayName)}${body.data.role === "host" ? "&host=1" : ""}`, { replace: true });
    }).catch((cause) => { if (!cancelled) setError(cause instanceof Error ? cause.message : "The classroom link could not be used."); });
    return () => { cancelled = true; };
  }, [navigate, token]);
  return <main className="center-state"><h1>Joining your Academy classroom</h1><p className="sub">{error || "Checking your secure classroom link…"}</p></main>;
}
