"use client";

import { createClient, SupabaseClient, User } from "@supabase/supabase-js";
import { useEffect, useState } from "react";

const card: React.CSSProperties = { width: "min(620px, 100%)", margin: "72px auto", padding: 32, background: "#181725", border: "1px solid #3b3855", borderRadius: 16, boxShadow: "0 24px 80px #000" };
const button: React.CSSProperties = { width: "100%", marginTop: 20, padding: 14, border: 0, borderRadius: 9, background: "#a5a2ff", color: "#17152a", fontWeight: 800, cursor: "pointer" };

export default function SyncPage() {
  const [client, setClient] = useState<SupabaseClient | null>(null);
  const [user, setUser] = useState<User | null>(null);
  const [message, setMessage] = useState("Loading secure desktop sync…");

  useEffect(() => { fetch("/api/config").then(async (r) => ({ ok: r.ok, body: await r.json() })).then(({ ok, body }) => {
    if (!ok) return setMessage(body.error ?? "Cheetrade is still being configured.");
    const supabase = createClient(body.url, body.key); setClient(supabase);
    supabase.auth.getUser().then(({ data }) => { setUser(data.user); setMessage(data.user ? "" : "Sign in through the connection page first."); });
  }).catch(() => setMessage("Could not start secure desktop sync.")); }, []);

  async function downloadConfig() {
    if (!client) return;
    const session = (await client.auth.getSession()).data.session;
    if (!session) return setMessage("Your session expired. Sign in again.");
    const response = await fetch("/api/mt5/import-token", { headers: { authorization: `Bearer ${session.access_token}` } });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) return setMessage(data.error ?? "Could not create the desktop setup file.");
    const blob = new Blob([JSON.stringify({ import_url: data.importUrl, import_token: data.token }, null, 2)], { type: "application/json" });
    const link = document.createElement("a"); link.href = URL.createObjectURL(blob); link.download = "config.json"; link.click(); URL.revokeObjectURL(link.href);
    setMessage("Downloaded config.json. Place it beside sync_mt5.py, then run the helper.");
  }

  return <main style={{ minHeight: "100vh", padding: "1px 24px", background: "radial-gradient(circle at 80% 10%,#302b71,transparent 34%),#0c0b14" }}><div style={card}><a href="/" style={{ color: "#b9b7ff", textDecoration: "none", fontWeight: 700 }}>← cheetrade</a><p style={{ color: "#b9b7ff", fontSize: 11, letterSpacing: 1.5, fontWeight: 800, marginTop: 35 }}>MT5 DESKTOP SYNC</p><h1 style={{ fontSize: 38, letterSpacing: -1.8, margin: "8px 0" }}>Import your MT5 history.</h1><p style={{ color: "#b0aec0", lineHeight: 1.55 }}>The helper reads closed deals from the MT5 desktop app already open on this computer. It has no trading commands.</p>{user && <><button style={button} onClick={downloadConfig}>Download secure config file</button><ol style={{ color: "#c7c4ff", lineHeight: 1.7, paddingLeft: 20 }}><li>Put <code>config.json</code> beside <code>sync_mt5.py</code>.</li><li>Install its two packages once.</li><li>Run <code>python sync_mt5.py</code> while XM MT5 is open.</li></ol></>}{message && <p style={{ color: "#c7c4ff", fontSize: 13, lineHeight: 1.45 }}>{message}</p>}</div></main>;
}
