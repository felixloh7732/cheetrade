"use client";

import { createClient, User } from "@supabase/supabase-js";
import { useEffect, useMemo, useState } from "react";

type Deal = { id: string; symbol: string; side: "long" | "short"; volume: number; profit: number; commission: number; swap: number; fee: number; occurred_at: string };
const net = (deal: Deal) => Number(deal.profit) + Number(deal.commission) + Number(deal.swap) + Number(deal.fee);
const key = (date: Date) => date.toISOString().slice(0, 10);
const money = (value: number) => new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 2 }).format(value);

export default function JournalPage() {
  const [user, setUser] = useState<User | null>(null);
  const [deals, setDeals] = useState<Deal[]>([]);
  const [message, setMessage] = useState("Loading your dashboard…");
  const [month, setMonth] = useState<Date | null>(null);

  useEffect(() => { fetch("/api/config").then(async (r) => ({ ok: r.ok, body: await r.json() })).then(({ ok, body }) => {
    if (!ok) return setMessage(body.error ?? "Cheetrade is still being configured.");
    const supabase = createClient(body.url, body.key);
    supabase.auth.getUser().then(async ({ data }) => {
      setUser(data.user); if (!data.user) return setMessage("Sign in through the connection page to open your dashboard.");
      const { data: rows, error } = await supabase.from("mt5_deals").select("id,symbol,side,volume,profit,commission,swap,fee,occurred_at").order("occurred_at", { ascending: true });
      if (error) return setMessage(error.message);
      const loaded = (rows ?? []) as Deal[]; setDeals(loaded); setMonth(loaded.length ? new Date(loaded[loaded.length - 1].occurred_at) : new Date()); setMessage("");
    });
  }).catch(() => setMessage("Could not load your dashboard.")); }, []);

  const stats = useMemo(() => {
    const values = deals.map(net); const result = values.reduce((sum, value) => sum + value, 0); const wins = values.filter((value) => value > 0).length;
    let streak = 0; for (let i = values.length - 1; i >= 0; i--) { if ((values[i] >= 0) === (values[values.length - 1] >= 0)) streak++; else break; }
    return { result, winRate: deals.length ? wins / deals.length * 100 : 0, average: deals.length ? result / deals.length : 0, streak, green: values.at(-1) ?? 0 };
  }, [deals]);
  const daily = useMemo(() => deals.reduce<Record<string, { pnl: number; count: number }>>((all, deal) => { const day = key(new Date(deal.occurred_at)); const current = all[day] ?? { pnl: 0, count: 0 }; current.pnl += net(deal); current.count++; all[day] = current; return all; }, {}), [deals]);
  const curve = useMemo(() => { let cumulative = 0; return deals.map((deal) => cumulative += net(deal)); }, [deals]);
  const calendar = useMemo(() => {
    const active = month ?? new Date(); const start = new Date(active.getFullYear(), active.getMonth(), 1); const first = new Date(start); first.setDate(1 - ((start.getDay() + 6) % 7));
    return Array.from({ length: 42 }, (_, index) => { const day = new Date(first); day.setDate(first.getDate() + index); return day; });
  }, [month]);
  const activeMonth = month ?? new Date();
  const chartMin = Math.min(0, ...curve), chartMax = Math.max(0, ...curve), spread = chartMax - chartMin || 1;
  const changeMonth = (delta: number) => setMonth(new Date(activeMonth.getFullYear(), activeMonth.getMonth() + delta, 1));

  return <main className="trade-app"><aside className="app-sidebar"><a href="/" className="app-logo"><i>c</i></a><button className="side-add" aria-label="Import MT5 history" onClick={() => location.assign("/sync")}>+</button><a className="side-active" href="/journal" aria-label="Dashboard">▦</a><a href="/sync" aria-label="Sync MT5">↻</a><span className="side-bottom">⚙</span></aside><div className="app-content"><header className="app-topbar"><div><b>Dashboard</b><small>{deals.length ? `Last import · ${new Date(deals[deals.length - 1].occurred_at).toLocaleString()}` : "Your private MT5 journal"}</small></div><div className="top-actions"><button>⌄ Filters</button><button>◷ All time</button><button>◉ All accounts</button><span className="user-dot">{user?.email?.[0]?.toUpperCase() ?? "C"}</span></div></header>{message ? <div className="dashboard-message">{message}</div> : <><section className="metric-grid"><DashMetric label="Result" value={money(stats.result)} sub={`${deals.length} trades`} good={stats.result >= 0} /><DashMetric label="Win rate" value={`${stats.winRate.toFixed(0)}%`} sub={`${deals.filter((deal) => net(deal) > 0).length} winning trades`} good={stats.winRate >= 50} /><DashMetric label="Average P&L" value={money(stats.average)} sub="per closed deal" good={stats.average >= 0} /><DashMetric label="Current trade streak" value={`${stats.streak} trade${stats.streak === 1 ? "" : "s"}`} sub={stats.green >= 0 ? "positive streak" : "negative streak"} good={stats.green >= 0} /></section><section className="dashboard-grid"><div className="calendar-card"><div className="panel-title"><div><button onClick={() => changeMonth(-1)}>‹</button><b>{activeMonth.toLocaleString("en-US", { month: "long", year: "numeric" })}</b><button onClick={() => changeMonth(1)}>›</button></div><span>Monthly result <strong className={Object.values(daily).reduce((sum, day) => sum + day.pnl, 0) >= 0 ? "positive" : "negative"}>{money(Object.values(daily).reduce((sum, day) => sum + day.pnl, 0))}</strong></span></div><div className="weekdays">{["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"].map((day) => <span key={day}>{day}</span>)}</div><div className="calendar-grid">{calendar.map((day) => { const item = daily[key(day)]; const inMonth = day.getMonth() === activeMonth.getMonth(); return <div className={`calendar-day ${!inMonth ? "muted" : ""} ${item ? item.pnl >= 0 ? "gain" : "loss" : ""}`} key={day.toISOString()}><small>{day.getDate()}</small>{item && <><b>{money(item.pnl)}</b><span>{item.count} trade{item.count === 1 ? "" : "s"}</span></>}</div>; })}</div></div><div className="right-column"><div className="curve-card"><div className="panel-title"><b>Equity curve ($)</b><span>Imported MT5 history</span></div><div className="curve-bars">{curve.slice(-48).map((value, index) => <i key={index} style={{ height: `${Math.max(5, ((value - chartMin) / spread) * 88)}%` }} />)}</div><div className="curve-labels"><span>{money(chartMin)}</span><span>{money(chartMax)}</span></div></div><div className="trades-card"><div className="panel-title"><b>Recent trades</b><a href="/sync">Resync</a></div><div className="trade-head"><span>Close date</span><span>Symbol</span><span>Net P&L</span></div>{[...deals].reverse().slice(0, 6).map((deal) => <div className="trade-row" key={deal.id}><span>{new Date(deal.occurred_at).toLocaleDateString()}</span><b>{deal.symbol}</b><strong className={net(deal) >= 0 ? "positive" : "negative"}>{money(net(deal))}</strong></div>)}</div></div></section></>}</div></main>;
}

function DashMetric({ label, value, sub, good }: { label: string; value: string; sub: string; good: boolean }) { return <article className="dash-metric"><span>{label}</span><b>{value}</b><small className={good ? "positive" : "negative"}>{sub}</small></article>; }
