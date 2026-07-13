"use client";

import { createClient, SupabaseClient, User } from "@supabase/supabase-js";
import { useEffect, useMemo, useState } from "react";

type Deal = { id: string; symbol: string; side: "long" | "short"; volume: number; price: number; profit: number; commission: number; swap: number; fee: number; occurred_at: string };
const shell: React.CSSProperties = { maxWidth: 1120, margin: "0 auto", padding: "44px 24px 80px" };
const card: React.CSSProperties = { background: "#181725", border: "1px solid #36334e", borderRadius: 14, padding: 22 };
const tableCell: React.CSSProperties = { padding: "14px 10px", borderBottom: "1px solid #2a283d" };
function money(value: number) { return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 2 }).format(value); }

export default function JournalPage() {
  const [user, setUser] = useState<User | null>(null);
  const [deals, setDeals] = useState<Deal[]>([]);
  const [message, setMessage] = useState("Loading your private journal…");
  useEffect(() => { fetch("/api/config").then(async (r) => ({ ok: r.ok, body: await r.json() })).then(({ ok, body }) => {
    if (!ok) return setMessage(body.error ?? "Cheetrade is still being configured.");
    const supabase: SupabaseClient = createClient(body.url, body.key);
    supabase.auth.getUser().then(async ({ data }) => {
      setUser(data.user); if (!data.user) return setMessage("Sign in through the connection page to see your journal.");
      const { data: rows, error } = await supabase.from("mt5_deals").select("id,symbol,side,volume,price,profit,commission,swap,fee,occurred_at").order("occurred_at", { ascending: false });
      if (error) return setMessage(error.message); setDeals((rows ?? []) as Deal[]); setMessage("");
    });
  }).catch(() => setMessage("Could not load your private journal.")); }, []);
  const metrics = useMemo(() => { const values = deals.map((deal) => Number(deal.profit) + Number(deal.commission) + Number(deal.swap) + Number(deal.fee)); const net = values.reduce((sum, value) => sum + value, 0); const wins = values.filter((value) => value > 0).length; const grossWin = values.filter((value) => value > 0).reduce((sum, value) => sum + value, 0); const grossLoss = Math.abs(values.filter((value) => value < 0).reduce((sum, value) => sum + value, 0)); return { net, winRate: deals.length ? wins / deals.length * 100 : 0, factor: grossLoss ? grossWin / grossLoss : grossWin ? Infinity : 0 }; }, [deals]);
  return <main style={{ minHeight: "100vh", background: "radial-gradient(circle at 86% 0%,#302b71,transparent 38%),#0c0b14", color: "#f4f3ff" }}><div style={shell}><nav style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 48 }}><a href="/" style={{ color: "#b9b7ff", textDecoration: "none", fontWeight: 800 }}>← cheetrade</a><span style={{ color: "#83e2a6", fontSize: 13 }}>{user ? user.email : "Private journal"}</span></nav><p style={{ color: "#b9b7ff", fontSize: 11, letterSpacing: 1.5, fontWeight: 800 }}>YOUR JOURNAL</p><h1 style={{ fontSize: "clamp(38px,6vw,64px)", letterSpacing: -3, margin: "8px 0" }}>Your trading, <em style={{ color: "#aaa8ff", fontWeight: 400 }}>in focus.</em></h1><p style={{ color: "#b0aec0", marginBottom: 32 }}>{deals.length ? `${deals.length} closed MT5 deals imported` : "Your imported MT5 history will appear here."}</p>{message ? <div style={card}>{message}</div> : <><section style={{ display: "grid", gridTemplateColumns: "repeat(3,minmax(0,1fr))", gap: 14, marginBottom: 18 }}><Metric label="Net P&L" value={money(metrics.net)} good={metrics.net >= 0} /><Metric label="Win rate" value={`${metrics.winRate.toFixed(1)}%`} good={metrics.winRate >= 50} /><Metric label="Profit factor" value={metrics.factor === Infinity ? "∞" : metrics.factor.toFixed(2)} good={metrics.factor >= 1} /></section><section style={card}><div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: 8 }}><div><b>Closed trades</b><p style={{ color: "#9995aa", fontSize: 13, margin: "5px 0" }}>Read-only import from your XM MT5 desktop app</p></div><a href="/sync" style={{ color: "#b9b7ff", fontWeight: 700 }}>Sync again →</a></div><div style={{ overflowX: "auto" }}><table style={{ width: "100%", borderCollapse: "collapse", fontSize: 14 }}><thead style={{ color: "#9995aa", textAlign: "left" }}><tr><th style={tableCell}>Instrument</th><th style={tableCell}>Side</th><th style={tableCell}>Volume</th><th style={tableCell}>Closed</th><th style={{ ...tableCell, textAlign: "right" }}>Net P&L</th></tr></thead><tbody>{deals.map((deal) => { const net = Number(deal.profit) + Number(deal.commission) + Number(deal.swap) + Number(deal.fee); return <tr key={deal.id}><td style={tableCell}><b>{deal.symbol}</b></td><td style={{ ...tableCell, color: deal.side === "long" ? "#83e2a6" : "#f0a6b7" }}>{deal.side}</td><td style={tableCell}>{deal.volume}</td><td style={{ ...tableCell, color: "#b0aec0" }}>{new Date(deal.occurred_at).toLocaleString()}</td><td style={{ ...tableCell, textAlign: "right", color: net >= 0 ? "#83e2a6" : "#f0a6b7", fontWeight: 800 }}>{money(net)}</td></tr>; })}</tbody></table></div></section></>}</div></main>;
}

function Metric({ label, value, good }: { label: string; value: string; good: boolean }) { return <article style={card}><p style={{ margin: 0, color: "#9995aa", fontSize: 13 }}>{label}</p><strong style={{ fontSize: 28, display: "block", marginTop: 9, color: good ? "#83e2a6" : "#f0a6b7" }}>{value}</strong></article>; }
