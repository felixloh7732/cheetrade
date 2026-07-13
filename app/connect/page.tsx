"use client";

import { FormEvent, useEffect, useState } from "react";
import { createClient, SupabaseClient, User } from "@supabase/supabase-js";

const card: React.CSSProperties = { width: "min(520px, 100%)", margin: "72px auto", padding: 32, background: "#181725", border: "1px solid #3b3855", borderRadius: 16, boxShadow: "0 24px 80px #000" };
const input: React.CSSProperties = { width: "100%", marginTop: 7, padding: "13px 14px", background: "#100f1b", border: "1px solid #3b3855", borderRadius: 8, color: "white" };
const button: React.CSSProperties = { width: "100%", marginTop: 20, padding: 14, border: 0, borderRadius: 9, background: "#a5a2ff", color: "#17152a", fontWeight: 800, cursor: "pointer" };

export default function ConnectPage() {
  const [client, setClient] = useState<SupabaseClient | null>(null);
  const [user, setUser] = useState<User | null>(null);
  const [email, setEmail] = useState("");
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => { fetch("/api/config").then(async (r) => ({ ok: r.ok, body: await r.json() })).then(({ ok, body: config }) => {
    if (!ok) return setMessage(config.error ?? "Cheetrade is still being configured. Please try again shortly.");
    const supabase = createClient(config.url, config.key); setClient(supabase);
    supabase.auth.getUser().then(({ data }) => setUser(data.user));
    const { data: subscription } = supabase.auth.onAuthStateChange((_event, session) => setUser(session?.user ?? null));
    return () => subscription.subscription.unsubscribe();
  }).catch(() => setMessage("Could not start secure sign-in.")); }, []);

  async function signIn(event: FormEvent) {
    event.preventDefault(); if (!client) return; setBusy(true); setMessage("");
    const { error } = await client.auth.signInWithOtp({ email, options: { emailRedirectTo: window.location.origin + "/connect" } });
    setBusy(false); setMessage(error ? error.message : "Check your email for your secure Cheetrade sign-in link.");
  }
  async function connect(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    if (!client) return setMessage("Secure sign-in is still loading. Please wait a moment and try again.");
    setBusy(true); setMessage("Saving your encrypted read-only connection…");
    try {
      const session = (await client.auth.getSession()).data.session;
      if (!session) { setMessage("Your session expired. Please sign in again."); return; }
      const data = new FormData(form);
      const endpoint = new URL("/api/mt5/connect", window.location.origin).toString();
      const response = await fetch(endpoint, { method: "POST", headers: { "content-type": "application/json", authorization: `Bearer ${session.access_token}` }, body: JSON.stringify({ brokerServer: data.get("server"), accountNumber: data.get("account"), investorPassword: data.get("password") }) });
      const result = await response.json().catch(() => ({}));
      setMessage(response.ok ? "Connection saved. Open /sync to set up your MT5 desktop helper." : result.error ?? "Connection could not be saved. Please try again later.");
    } catch (error) {
      const detail = error instanceof Error ? error.message : "Unknown browser error";
      setMessage(`The browser could not send the secure request: ${detail}`);
    } finally { setBusy(false); }
  }
  return <main style={{ minHeight: "100vh", padding: "1px 24px", background: "radial-gradient(circle at 80% 10%,#302b71,transparent 34%),#0c0b14" }}><div style={card}><a href="/" style={{ color: "#b9b7ff", textDecoration: "none", fontWeight: 700 }}>← cheetrade</a><p style={{ color: "#b9b7ff", fontSize: 11, letterSpacing: 1.5, fontWeight: 800, marginTop: 35 }}>READ-ONLY MT5 JOURNAL</p><h1 style={{ fontSize: 38, letterSpacing: -1.8, margin: "8px 0" }}>Connect your account.</h1><p style={{ color: "#b0aec0", lineHeight: 1.55 }}>Cheetrade uses Investor Password access only. It cannot place, modify, or close trades.</p>{!user ? <form onSubmit={signIn}><label>Email address<input style={input} type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@example.com" required /></label><button type="submit" style={button} disabled={busy}>{busy ? "Sending…" : "Send secure sign-in link"}</button></form> : <form onSubmit={connect}><p style={{ color: "#83e2a6", fontSize: 13 }}>Signed in as {user.email}</p><label>Broker server<input style={input} name="server" placeholder="XMGlobal-MT5 2" required /></label><br /><label>MT5 account number<input style={input} name="account" inputMode="numeric" placeholder="12345678" required /></label><br /><label>Investor Password<input style={input} name="password" type="password" autoComplete="new-password" required /></label><button type="submit" style={button} disabled={busy}>{busy ? "Saving…" : "Save read-only connection"}</button></form>}<p style={{ color: "#9995aa", fontSize: 12, lineHeight: 1.5, marginTop: 20 }}>Credentials are encrypted before storage. You can disconnect your account at any time.</p>{message && <p style={{ color: "#c7c4ff", fontSize: 13, lineHeight: 1.45 }}>{message}</p>}</div></main>;
}
