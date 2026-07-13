"use client";

import { useState } from "react";

const trades = [
  ["EURUSD", "Long", "+$184.20", "Today, 10:42", "up"],
  ["XAUUSD", "Short", "+$96.00", "Today, 09:18", "up"],
  ["GBPJPY", "Long", "-$42.50", "Yesterday", "down"],
  ["NAS100", "Short", "+$218.75", "Yesterday", "up"],
];

export default function Home() {
  const [connected, setConnected] = useState(false);
  const [range, setRange] = useState("30D");

  return (
    <main>
      <section className="hero">
        <nav className="nav shell">
          <a className="brand" href="#top"><span>c</span>cheetrade</a>
          <div className="navlinks"><a href="#product">Product</a><a href="#how">How it works</a><a href="#pricing">Pricing</a></div>
          <button className="ghost" onClick={() => document.getElementById("product")?.scrollIntoView({ behavior: "smooth" })}>View demo</button>
        </nav>
        <div className="hero-inner shell" id="top">
          <div className="eyebrow"><i /> Read-only MT5 journal</div>
          <h1>Your trades,<br /><em>finally in focus.</em></h1>
          <p>Cheetrade turns your MT5 history into a calm, clear trading journal—so you can see the habits behind every result.</p>
          <div className="hero-actions">
            <a className="primary" href="/connect">{connected ? "MT5 account connected ✓" : "Connect MT5 account"}</a>
            <a className="text-link" href="#product">Explore the journal <b>→</b></a>
          </div>
          <small>Read-only access · No trades can be placed from Cheetrade</small>
        </div>
        <div className="orb orb-one" /><div className="orb orb-two" />
      </section>

      <section className="product-section shell" id="product">
        <div className="section-heading"><div><span className="kicker">THE JOURNAL</span><h2>See the signal,<br />not the noise.</h2></div><p>One private workspace for every MT5 account, every session and every insight worth remembering.</p></div>
        <div className="dashboard">
          <aside><a className="brand side-brand" href="#top"><span>c</span>cheetrade</a><div className="account"><span className="avatar">A</span><div><strong>Alex Morgan</strong><small>Personal workspace</small></div></div><div className="side-menu"><b>Overview</b><a>Trade journal</a><a>Calendar</a><a>Reports</a><a>Strategies</a></div><div className="sync"><span>●</span> MT5 sync active<br /><small>Updated just now</small></div></aside>
          <div className="main-panel">
            <header><div><span className="kicker">OVERVIEW</span><h3>Good morning, Alex.</h3><p>Here&apos;s how your trading is taking shape.</p></div><button className="range" onClick={() => setRange(range === "30D" ? "90D" : "30D")}>Last {range}⌄</button></header>
            <div className="metrics"><Metric label="Net P&L" value="$2,846.45" change="↗ 18.4%" /><Metric label="Win rate" value="63.2%" change="↗ 4.1%" /><Metric label="Profit factor" value="1.84" change="↗ 0.18" /></div>
            <div className="chart-card"><div className="card-title"><div><b>Performance</b><small>Cumulative net profit</small></div><strong>$2,846</strong></div><div className="chart"><span className="line one" /><span className="line two" /><svg viewBox="0 0 700 205" preserveAspectRatio="none" aria-label="Rising performance line"><defs><linearGradient id="fill" x1="0" x2="0" y1="0" y2="1"><stop stopColor="#9c9bff" stopOpacity=".42"/><stop offset="1" stopColor="#9c9bff" stopOpacity="0"/></linearGradient></defs><path d="M0 168 C45 161 48 176 91 153 S138 134 170 146 S219 121 253 127 S301 86 336 102 S385 90 421 107 S467 65 505 76 S548 39 583 52 S643 19 700 24 V205 H0Z" fill="url(#fill)"/><path d="M0 168 C45 161 48 176 91 153 S138 134 170 146 S219 121 253 127 S301 86 336 102 S385 90 421 107 S467 65 505 76 S548 39 583 52 S643 19 700 24" fill="none" stroke="#aaa8ff" strokeWidth="3"/></svg></div></div>
            <div className="bottom-grid"><div className="trades-card"><div className="card-title"><div><b>Recent trades</b><small>Synced from MT5</small></div><a>View all →</a></div>{trades.map((t) => <div className="trade" key={t[0]+t[3]}><b>{t[0]}</b><span>{t[1]}</span><small>{t[3]}</small><strong className={t[4]}>{t[2]}</strong></div>)}</div><div className="insight"><span className="spark">✦</span><span className="kicker">THIS WEEK&apos;S INSIGHT</span><h4>Your London-session trades are your strongest.</h4><p>They account for 68% of this week&apos;s profit with a 72% win rate.</p><a>Explore session report →</a></div></div>
          </div>
        </div>
      </section>

      <section className="features shell" id="how"><span className="kicker">BUILT FOR REFLECTION</span><h2>Better data. Better decisions.</h2><div className="feature-grid"><Feature n="01" title="Automatic MT5 imports" text="Connect once. New closed trades and balances arrive in your journal automatically."/><Feature n="02" title="A journal with memory" text="Add notes, screenshots, tags and strategies while the reason behind each trade is fresh."/><Feature n="03" title="Patterns that matter" text="Understand performance by session, instrument, direction and strategy—not just a total P&L."/></div></section>
      <section className="cta" id="pricing"><div className="shell"><span className="kicker">START CLEARER</span><h2>Your next trading review<br />starts here.</h2><p>Create your private journal and connect an MT5 account when you&apos;re ready.</p><a className="primary" href="/connect">{connected ? "You’re ready to review" : "Start your journal"}</a></div></section>
      <footer className="shell"><a className="brand" href="#top"><span>c</span>cheetrade</a><p>© 2026 Cheetrade. Analytics only. No trade execution.</p><div><a>Privacy</a><a>Terms</a><a>Support</a></div></footer>
    </main>
  );
}

function Metric({ label, value, change }: { label: string; value: string; change: string }) { return <div className="metric"><small>{label}</small><strong>{value}</strong><span>{change}</span><p>vs previous period</p></div>; }
function Feature({ n, title, text }: { n: string; title: string; text: string }) { return <article><span>{n}</span><h3>{title}</h3><p>{text}</p></article>; }
