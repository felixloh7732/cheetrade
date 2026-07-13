"use client";

import { createClient, SupabaseClient, User } from "@supabase/supabase-js";
import { useEffect, useMemo, useState } from "react";

type Deal = {
  id: string;
  symbol: string;
  side: "long" | "short";
  volume: number;
  profit: number;
  commission: number;
  swap: number;
  fee: number;
  occurred_at: string;
};

type Range = "30D" | "90D" | "ALL";
type Position = { id: string; ticket: string; symbol: string; side: "long" | "short"; volume: number; open_price: number; current_price: number; stop_loss: number; take_profit: number; profit: number; swap: number; opened_at: string; synced_at: string };
type AccountSnapshot = { balance: number; equity: number; margin: number; free_margin: number; currency: string; server: string | null; synced_at: string };

const net = (deal: Deal) =>
  Number(deal.profit) + Number(deal.commission) + Number(deal.swap) + Number(deal.fee);
const dateKey = (date: Date) => date.toISOString().slice(0, 10);
const money = (value: number) =>
  new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 2,
  }).format(value);
const errorText = (error: unknown) => {
  if (error instanceof Error) return error.message;
  if (error && typeof error === "object" && "message" in error && typeof error.message === "string") return error.message;
  return "Could not load your dashboard.";
};

export default function JournalPage() {
  const [client, setClient] = useState<SupabaseClient | null>(null);
  const [user, setUser] = useState<User | null>(null);
  const [deals, setDeals] = useState<Deal[]>([]);
  const [positions, setPositions] = useState<Position[]>([]);
  const [account, setAccount] = useState<AccountSnapshot | null>(null);
  const [status, setStatus] = useState<"loading" | "ready" | "signed-out" | "error">("loading");
  const [message, setMessage] = useState("");
  const [liveMessage, setLiveMessage] = useState("");
  const [month, setMonth] = useState<Date | null>(null);
  const [range, setRange] = useState<Range>("ALL");

  useEffect(() => {
    let timer: ReturnType<typeof setInterval> | undefined;
    fetch("/api/config")
      .then(async (response) => ({ ok: response.ok, body: await response.json() }))
      .then(async ({ ok, body }) => {
        if (!ok) throw new Error(body.error ?? "Cheetrade is still being configured.");
        const supabase = createClient(body.url, body.key);
        setClient(supabase);
        const { data: auth } = await supabase.auth.getUser();
        setUser(auth.user);
        if (!auth.user) {
          setStatus("signed-out");
          return;
        }

        const loadDashboard = async (initial = false) => {
          const [dealResult, positionResult, accountResult] = await Promise.all([
            supabase.from("mt5_deals").select("id,symbol,side,volume,profit,commission,swap,fee,occurred_at").order("occurred_at", { ascending: true }),
            supabase.from("mt5_positions").select("id,ticket,symbol,side,volume,open_price,current_price,stop_loss,take_profit,profit,swap,opened_at,synced_at").order("opened_at", { ascending: true }),
            supabase.from("mt5_account_snapshots").select("balance,equity,margin,free_margin,currency,server,synced_at").maybeSingle(),
          ]);
          if (dealResult.error) {
            if (initial) throw dealResult.error;
            return;
          }
          const loaded = (dealResult.data ?? []) as Deal[];
          setDeals(loaded);
          if (positionResult.error || accountResult.error) {
            setLiveMessage("Live MT5 metrics are waiting for database access. Your closed-trade journal is still available.");
          } else {
            setPositions((positionResult.data ?? []) as Position[]);
            setAccount(accountResult.data as AccountSnapshot | null);
            setLiveMessage("");
          }
          if (initial) setMonth(loaded.length ? new Date(loaded.at(-1)!.occurred_at) : new Date());
          setStatus("ready");
        };
        await loadDashboard(true);
        timer = setInterval(() => void loadDashboard(), 5000);
      })
      .catch((error: unknown) => {
        setMessage(errorText(error));
        setStatus("error");
      });
    return () => { if (timer) clearInterval(timer); };
  }, []);

  const filteredDeals = useMemo(() => {
    if (range === "ALL") return deals;
    const days = range === "30D" ? 30 : 90;
    const latest = deals.length ? new Date(deals.at(-1)!.occurred_at).getTime() : 0;
    const cutoff = latest - days * 24 * 60 * 60 * 1000;
    return deals.filter((deal) => new Date(deal.occurred_at).getTime() >= cutoff);
  }, [deals, range]);

  const stats = useMemo(() => {
    const values = filteredDeals.map(net);
    const result = values.reduce((sum, value) => sum + value, 0);
    const wins = values.filter((value) => value > 0);
    const losses = values.filter((value) => value < 0);
    const grossProfit = wins.reduce((sum, value) => sum + value, 0);
    const grossLoss = Math.abs(losses.reduce((sum, value) => sum + value, 0));
    let streak = 0;
    for (let index = values.length - 1; index >= 0; index--) {
      if ((values[index] >= 0) === ((values.at(-1) ?? 0) >= 0)) streak++;
      else break;
    }
    return {
      result,
      winRate: values.length ? (wins.length / values.length) * 100 : 0,
      profitFactor: grossLoss ? grossProfit / grossLoss : grossProfit ? Infinity : 0,
      average: values.length ? result / values.length : 0,
      streak,
      latestPositive: (values.at(-1) ?? 0) >= 0,
    };
  }, [filteredDeals]);

  const daily = useMemo(
    () =>
      filteredDeals.reduce<Record<string, { pnl: number; count: number }>>((all, deal) => {
        const day = dateKey(new Date(deal.occurred_at));
        const current = all[day] ?? { pnl: 0, count: 0 };
        current.pnl += net(deal);
        current.count++;
        all[day] = current;
        return all;
      }, {}),
    [filteredDeals],
  );

  const curve = useMemo(
    () => filteredDeals.map((_, index) => filteredDeals.slice(0, index + 1).reduce((sum, deal) => sum + net(deal), 0)),
    [filteredDeals],
  );

  const activeMonth = useMemo(() => month ?? new Date(account?.synced_at ?? deals.at(-1)?.occurred_at ?? 0), [account?.synced_at, deals, month]);
  const calendar = useMemo(() => {
    const start = new Date(activeMonth.getFullYear(), activeMonth.getMonth(), 1);
    const first = new Date(start);
    first.setDate(1 - ((start.getDay() + 6) % 7));
    return Array.from({ length: 42 }, (_, index) => {
      const day = new Date(first);
      day.setDate(first.getDate() + index);
      return day;
    });
  }, [activeMonth]);

  const monthlyResult = calendar.reduce((sum, day) => {
    if (day.getMonth() !== activeMonth.getMonth()) return sum;
    return sum + (daily[dateKey(day)]?.pnl ?? 0);
  }, 0);
  const chartMin = Math.min(0, ...curve);
  const chartMax = Math.max(0, ...curve);
  const chartSpread = chartMax - chartMin || 1;
  const displayName = user?.user_metadata?.full_name ?? user?.email?.split("@")[0] ?? "Trader";

  const changeMonth = (delta: number) =>
    setMonth(new Date(activeMonth.getFullYear(), activeMonth.getMonth() + delta, 1));

  async function signOut() {
    await client?.auth.signOut();
    window.location.assign("/");
  }

  return (
    <main className="trade-app">
      <aside className="app-sidebar" aria-label="Journal navigation">
        <a href="/journal" className="app-logo" aria-label="Cheetrade dashboard">c</a>
        <nav>
          <a className="side-active" href="/journal" title="Overview"><span>⌂</span><small>Overview</small></a>
          <a href="/journal" title="Journal"><span>▤</span><small>Journal</small></a>
          <a href="/sync" title="Sync MT5"><span>↻</span><small>Sync</small></a>
        </nav>
        <a className="side-support" href="mailto:support@cheetrade.app" title="Support"><span>?</span><small>Support</small></a>
      </aside>

      <div className="app-content">
        <header className="app-topbar">
          <div>
            <p className="app-breadcrumb">CHEETRADE / OVERVIEW</p>
            <h1>Welcome back, {displayName}.</h1>
            <small>{deals.length ? `MT5 synced ${new Date(deals.at(-1)!.occurred_at).toLocaleString()}` : "Your private MT5 journal"}</small>
          </div>
          <div className="top-actions">
            <div className="range-control" aria-label="Dashboard period">
              {(["30D", "90D", "ALL"] as Range[]).map((item) => (
                <button className={range === item ? "active" : ""} key={item} onClick={() => setRange(item)}>{item}</button>
              ))}
            </div>
            <a className="sync-button" href="/sync">Sync MT5</a>
            <button className="user-menu" onClick={signOut} title="Sign out" aria-label="Sign out">
              {user?.email?.[0]?.toUpperCase() ?? "C"}
            </button>
          </div>
        </header>

        {status === "loading" && <DashboardLoading />}
        {status === "error" && <DashboardMessage title="Dashboard unavailable" text={message} action="Try again" href="/journal" />}
        {status === "signed-out" && <DashboardMessage title="Your journal is private" text="Sign in with your Cheetrade email link to view synced MT5 history." action="Sign in" href="/connect" />}
        {status === "ready" && !deals.length && !positions.length && !account && <DashboardMessage title="Your dashboard is ready" text="Run the read-only desktop sync once to fill this workspace with your XM MT5 account and trade activity." action="Set up MT5 sync" href="/sync" />}

        {status === "ready" && (deals.length > 0 || positions.length > 0 || account) && (
          <>
            {liveMessage && <div className="live-warning">{liveMessage}</div>}
            <section className="live-account" aria-label="Live MT5 account">
              <div className="live-status"><i /><span><b>{account?.server ?? "XM MT5"}</b><small>{account ? `Live sync · ${new Date(account.synced_at).toLocaleTimeString()}` : "Waiting for live sync"}</small></span></div>
              <dl><div><dt>Balance</dt><dd>{account ? money(Number(account.balance)) : "—"}</dd></div><div><dt>Equity</dt><dd>{account ? money(Number(account.equity)) : "—"}</dd></div><div><dt>Floating P&amp;L</dt><dd className={positions.reduce((sum, position) => sum + Number(position.profit) + Number(position.swap), 0) >= 0 ? "positive" : "negative"}>{account ? money(positions.reduce((sum, position) => sum + Number(position.profit) + Number(position.swap), 0)) : "—"}</dd></div><div><dt>Open trades</dt><dd>{positions.length}</dd></div></dl>
            </section>

            {positions.length > 0 && (
              <section className="open-positions-card">
                <div className="panel-title"><div><span className="panel-kicker">LIVE FROM MT5</span><h2>Open positions</h2></div><span className="live-chip"><i /> Refreshing automatically</span></div>
                <div className="position-head"><span>Symbol</span><span>Side</span><span>Volume</span><span>Open price</span><span>Current</span><span>Floating P&amp;L</span></div>
                {positions.map((position) => <div className="position-row" key={position.id}><span className="symbol"><i>{position.symbol.slice(0, 1)}</i><b>{position.symbol}</b></span><span className={`side-pill ${position.side}`}>{position.side}</span><span>{Number(position.volume).toFixed(2)}</span><span>{Number(position.open_price)}</span><span>{Number(position.current_price)}</span><strong className={Number(position.profit) + Number(position.swap) >= 0 ? "positive" : "negative"}>{money(Number(position.profit) + Number(position.swap))}</strong></div>)}
              </section>
            )}

            <section className="metric-grid" aria-label="Performance summary">
              <DashMetric label="Net result" value={money(stats.result)} sub={`${filteredDeals.length} closed trades`} good={stats.result >= 0} />
              <DashMetric label="Win rate" value={`${stats.winRate.toFixed(1)}%`} sub={`${filteredDeals.filter((deal) => net(deal) > 0).length} winning trades`} good={stats.winRate >= 50} />
              <DashMetric label="Profit factor" value={Number.isFinite(stats.profitFactor) ? stats.profitFactor.toFixed(2) : "∞"} sub="Gross profit / loss" good={stats.profitFactor >= 1} />
              <DashMetric label="Average trade" value={money(stats.average)} sub={`${stats.streak}-trade ${stats.latestPositive ? "win" : "loss"} streak`} good={stats.average >= 0} />
            </section>

            <section className="dashboard-grid">
              <article className="calendar-card">
                <div className="panel-title calendar-title">
                  <div>
                    <span className="panel-kicker">TRADING CALENDAR</span>
                    <div className="month-picker"><button onClick={() => changeMonth(-1)} aria-label="Previous month">‹</button><h2>{activeMonth.toLocaleString("en-US", { month: "long", year: "numeric" })}</h2><button onClick={() => changeMonth(1)} aria-label="Next month">›</button></div>
                  </div>
                  <div className="month-result"><small>MONTH RESULT</small><strong className={monthlyResult >= 0 ? "positive" : "negative"}>{money(monthlyResult)}</strong></div>
                </div>
                <div className="weekdays">{["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"].map((day) => <span key={day}>{day}</span>)}</div>
                <div className="calendar-grid">
                  {calendar.map((day) => {
                    const item = daily[dateKey(day)];
                    const inMonth = day.getMonth() === activeMonth.getMonth();
                    return (
                      <div className={`calendar-day ${!inMonth ? "muted" : ""} ${item ? item.pnl >= 0 ? "gain" : "loss" : ""}`} key={day.toISOString()}>
                        <small>{day.getDate()}</small>
                        {item && <><b>{money(item.pnl)}</b><span>{item.count} trade{item.count === 1 ? "" : "s"}</span></>}
                      </div>
                    );
                  })}
                </div>
              </article>

              <div className="right-column">
                <article className="curve-card">
                  <div className="panel-title">
                    <div><span className="panel-kicker">PERFORMANCE</span><h2>Equity curve</h2></div>
                    <strong className={stats.result >= 0 ? "positive" : "negative"}>{money(stats.result)}</strong>
                  </div>
                  <div className="curve-bars" aria-label={`Equity curve ending at ${money(stats.result)}`}>
                    {curve.slice(-56).map((value, index) => <i key={index} style={{ height: `${Math.max(4, ((value - chartMin) / chartSpread) * 92)}%` }} />)}
                  </div>
                  <div className="curve-labels"><span>{money(chartMin)}</span><span>{money(chartMax)}</span></div>
                </article>

                <article className="trades-card">
                  <div className="panel-title"><div><span className="panel-kicker">LATEST ACTIVITY</span><h2>Recent trades</h2></div><a href="/sync">Resync →</a></div>
                  <div className="trade-head"><span>Trade</span><span>Side</span><span>Closed</span><span>Net P&amp;L</span></div>
                  {[...filteredDeals].reverse().slice(0, 7).map((deal) => (
                    <div className="trade-row" key={deal.id}>
                      <span className="symbol"><i>{deal.symbol.slice(0, 1)}</i><b>{deal.symbol}</b></span>
                      <span className={`side-pill ${deal.side}`}>{deal.side}</span>
                      <span>{new Date(deal.occurred_at).toLocaleDateString(undefined, { day: "2-digit", month: "short" })}</span>
                      <strong className={net(deal) >= 0 ? "positive" : "negative"}>{money(net(deal))}</strong>
                    </div>
                  ))}
                </article>
              </div>
            </section>
          </>
        )}
      </div>
    </main>
  );
}

function DashMetric({ label, value, sub, good }: { label: string; value: string; sub: string; good: boolean }) {
  return <article className="dash-metric"><span>{label}</span><b>{value}</b><small className={good ? "positive" : "negative"}><i>{good ? "↗" : "↘"}</i>{sub}</small></article>;
}

function DashboardMessage({ title, text, action, href }: { title: string; text: string; action: string; href: string }) {
  return <section className="dashboard-message"><span>c</span><h2>{title}</h2><p>{text}</p><a href={href}>{action}</a></section>;
}

function DashboardLoading() {
  return <section className="dashboard-loading" aria-label="Loading dashboard"><div /><div /><div /><div /><article /><article /></section>;
}
