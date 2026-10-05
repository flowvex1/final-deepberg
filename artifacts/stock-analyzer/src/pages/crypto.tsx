import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Layout } from "@/components/layout";
import {
  AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer,
  CartesianGrid, ReferenceLine,
} from "recharts";
import { Loader2, TrendingUp, TrendingDown, Bitcoin, Newspaper, ExternalLink, Clock } from "lucide-react";

const BASE = import.meta.env.BASE_URL.replace(/\/$/, "");

const fmt = (n: number, decimals = 2) =>
  new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", minimumFractionDigits: decimals, maximumFractionDigits: decimals }).format(n);
const fmtLarge = (n: number) => {
  if (n >= 1e12) return `$${(n / 1e12).toFixed(2)}T`;
  if (n >= 1e9)  return `$${(n / 1e9).toFixed(2)}B`;
  if (n >= 1e6)  return `$${(n / 1e6).toFixed(2)}M`;
  return fmt(n);
};
const fmtPct = (n: number) => `${n >= 0 ? "+" : ""}${n.toFixed(2)}%`;
const fmtPrice = (n: number) => n >= 1000 ? fmt(n, 0) : n >= 1 ? fmt(n, 2) : fmt(n, 4);

const COINS = [
  { symbol: "BTC-USD",  name: "Bitcoin",   abbr: "BTC",  color: "#f7931a" },
  { symbol: "ETH-USD",  name: "Ethereum",  abbr: "ETH",  color: "#627eea" },
  { symbol: "SOL-USD",  name: "Solana",    abbr: "SOL",  color: "#9945ff" },
  { symbol: "BNB-USD",  name: "BNB",       abbr: "BNB",  color: "#f3ba2f" },
  { symbol: "XRP-USD",  name: "XRP",       abbr: "XRP",  color: "#346aa9" },
  { symbol: "DOGE-USD", name: "Dogecoin",  abbr: "DOGE", color: "#c2a633" },
  { symbol: "ADA-USD",  name: "Cardano",   abbr: "ADA",  color: "#0033ad" },
  { symbol: "AVAX-USD", name: "Avalanche", abbr: "AVAX", color: "#e84142" },
  { symbol: "LINK-USD", name: "Chainlink", abbr: "LINK", color: "#2a5ada" },
  { symbol: "DOT-USD",  name: "Polkadot",  abbr: "DOT",  color: "#e6007a" },
  { symbol: "LTC-USD",  name: "Litecoin",  abbr: "LTC",  color: "#bfbbbb" },
  { symbol: "UNI-USD",  name: "Uniswap",   abbr: "UNI",  color: "#ff007a" },
];

const PERIODS = ["1m", "5m", "15m", "1D", "7D", "1M"] as const;
type Period = typeof PERIODS[number];
const PERIOD_API: Record<Period, string> = {
  "1m": "1m", "5m": "5m", "15m": "15m", "1D": "1d", "7D": "5d", "1M": "1mo",
};

async function apiFetch(path: string) {
  const res = await fetch(`${BASE}${path}`);
  if (!res.ok) throw new Error("fetch failed");
  return res.json();
}

interface Quote {
  symbol: string; name: string; price: number; change: number; changePercent: number;
  high: number; low: number; open: number; previousClose: number;
  volume: number; marketCap: number; fiftyTwoWeekHigh: number; fiftyTwoWeekLow: number;
}
interface HistoryPoint { t: number; price: number; }

function CoinRow({ symbol, name, abbr, color, isActive, onClick }: {
  symbol: string; name: string; abbr: string; color: string;
  isActive: boolean; onClick: () => void;
}) {
  const { data: quote } = useQuery<Quote>({
    queryKey: ["crypto-quote", symbol],
    queryFn: () => apiFetch(`/api/stocks/${symbol}`),
    refetchInterval: 20000,
    staleTime: 10000,
  });

  const isUp = (quote?.changePercent ?? 0) >= 0;

  return (
    <button
      onClick={onClick}
      className={`w-full px-4 py-3 flex items-center gap-3 transition-colors text-left border-l-2 ${
        isActive
          ? "bg-accent/40 border-l-white/40"
          : "hover:bg-accent/20 border-l-transparent"
      }`}
    >
      <div className="w-7 h-7 rounded-full flex items-center justify-center shrink-0 text-[10px] font-black font-mono"
        style={{ background: `${color}22`, color }}>
        {abbr.slice(0, 1)}
      </div>
      <div className="min-w-0 flex-1">
        <p className="text-sm font-bold font-mono">{abbr}</p>
        <p className="text-[10px] text-muted-foreground">{name}</p>
      </div>
      <div className="text-right shrink-0">
        {quote ? (
          <>
            <p className="text-xs font-mono font-bold">{fmtPrice(quote.price)}</p>
            <p className={`text-[10px] font-mono font-bold ${isUp ? "text-emerald-400" : "text-red-400"}`}>
              {fmtPct(quote.changePercent)}
            </p>
          </>
        ) : (
          <Loader2 className="h-3 w-3 animate-spin text-muted-foreground" />
        )}
      </div>
    </button>
  );
}

function MainChart({ symbol, color }: { symbol: string; color: string }) {
  const [period, setPeriod] = useState<Period>("5m");

  const { data: quote } = useQuery<Quote>({
    queryKey: ["crypto-quote", symbol],
    queryFn: () => apiFetch(`/api/stocks/${symbol}`),
    refetchInterval: 15000,
    staleTime: 10000,
  });

  const { data: historyRaw, isLoading } = useQuery({
    queryKey: ["crypto-history", symbol, period],
    queryFn: () => apiFetch(`/api/stocks/${symbol}/history?period=${PERIOD_API[period]}`),
    refetchInterval: 30000,
    staleTime: 15000,
  });

  const points: HistoryPoint[] = (Array.isArray(historyRaw) ? historyRaw : [])
    .map((p: any) => ({
      t: typeof p.date === "number" ? p.date * 1000 : new Date(p.date).getTime(),
      price: p.close ?? 0,
    }))
    .filter((p) => p.price > 0);

  const price = quote?.price ?? points[points.length - 1]?.price ?? 0;
  const change = quote?.change ?? 0;
  const changePct = quote?.changePercent ?? 0;
  const isUp = changePct >= 0;
  const lineColor = isUp ? "#10b981" : "#ef4444";

  const openPrice = points[0]?.price;
  const minY = points.length ? Math.min(...points.map(p => p.price)) * 0.997 : 0;
  const maxY = points.length ? Math.max(...points.map(p => p.price)) * 1.003 : 1;

  const formatX = (tick: number) => {
    const d = new Date(tick);
    if (["1m", "5m", "15m", "1D"].includes(period))
      return d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
    return d.toLocaleDateString([], { month: "short", day: "numeric" });
  };

  const formatY = (v: number) =>
    v >= 10000 ? `$${(v / 1000).toFixed(0)}k` : v >= 1 ? `$${v.toFixed(0)}` : `$${v.toFixed(4)}`;

  const w52range = quote ? ((price - quote.fiftyTwoWeekLow) / (quote.fiftyTwoWeekHigh - quote.fiftyTwoWeekLow)) * 100 : 0;

  return (
    <div className="flex flex-col h-full gap-0">
      {/* Header */}
      <div className="px-6 pt-5 pb-3 border-b border-border">
        <div className="flex items-start justify-between gap-4">
          <div>
            <div className="flex items-baseline gap-3">
              <span className="text-4xl font-black font-mono tracking-tight">
                {price ? fmtPrice(price) : "—"}
              </span>
              <span className={`text-base font-mono font-bold ${isUp ? "text-emerald-400" : "text-red-400"}`}>
                {isUp ? "+" : ""}{fmt(change, 2)} ({fmtPct(changePct)})
              </span>
            </div>
            <p className="text-sm text-muted-foreground mt-0.5 font-mono">{quote?.name ?? symbol} · 24h</p>
          </div>
          <div className="flex items-center gap-1">
            {PERIODS.map((p) => (
              <button key={p} onClick={() => setPeriod(p)}
                className={`px-2.5 py-1 rounded text-xs font-mono font-bold transition-colors ${
                  period === p ? "bg-accent text-foreground" : "text-muted-foreground hover:text-foreground"
                }`}>
                {p}
              </button>
            ))}
          </div>
        </div>

        {/* Quick stats row */}
        {quote && (
          <div className="flex gap-6 mt-3 text-xs font-mono">
            <div><span className="text-muted-foreground">24h H </span><span className="text-emerald-400">{fmtPrice(quote.high)}</span></div>
            <div><span className="text-muted-foreground">24h L </span><span className="text-red-400">{fmtPrice(quote.low)}</span></div>
            <div><span className="text-muted-foreground">Open </span>{fmtPrice(quote.open)}</div>
            <div><span className="text-muted-foreground">Vol </span>{fmtLarge(quote.volume)}</div>
            {quote.marketCap && <div><span className="text-muted-foreground">Mkt Cap </span>{fmtLarge(quote.marketCap)}</div>}
          </div>
        )}
      </div>

      {/* Chart */}
      <div className="flex-1 px-2 py-3" style={{ minHeight: 280 }}>
        {isLoading ? (
          <div className="h-full flex items-center justify-center text-muted-foreground gap-2">
            <Loader2 className="h-5 w-5 animate-spin" /> Loading chart…
          </div>
        ) : points.length < 2 ? (
          <div className="h-full flex items-center justify-center text-muted-foreground text-sm">No chart data</div>
        ) : (
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={points} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
              <defs>
                <linearGradient id="cryptoGrad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%"  stopColor={lineColor} stopOpacity={0.3} />
                  <stop offset="95%" stopColor={lineColor} stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.04)" />
              <XAxis dataKey="t" tickFormatter={formatX} tick={{ fill: "#6b7280", fontSize: 10, fontFamily: "monospace" }} axisLine={false} tickLine={false} minTickGap={60} />
              <YAxis domain={[minY, maxY]} tickFormatter={formatY} tick={{ fill: "#6b7280", fontSize: 10, fontFamily: "monospace" }} axisLine={false} tickLine={false} width={62} />
              {openPrice && <ReferenceLine y={openPrice} stroke="rgba(255,255,255,0.15)" strokeDasharray="4 3" />}
              <Tooltip
                content={({ active, payload }) => {
                  if (!active || !payload?.length) return null;
                  const p = payload[0].value as number;
                  const diff = openPrice ? p - openPrice : 0;
                  const diffPct = openPrice ? (diff / openPrice) * 100 : 0;
                  return (
                    <div className="rounded-lg border border-border bg-card px-3 py-2 text-xs font-mono shadow-xl">
                      <p className="font-bold text-sm">{fmtPrice(p)}</p>
                      <p className={diff >= 0 ? "text-emerald-400" : "text-red-400"}>
                        {diff >= 0 ? "+" : ""}{fmt(diff, 2)} ({fmtPct(diffPct)})
                      </p>
                      <p className="text-muted-foreground mt-0.5">{new Date(payload[0].payload.t).toLocaleString()}</p>
                    </div>
                  );
                }}
              />
              <Area type="monotone" dataKey="price" stroke={lineColor} strokeWidth={2} fill="url(#cryptoGrad)" dot={false} activeDot={{ r: 4, fill: lineColor, strokeWidth: 0 }} />
            </AreaChart>
          </ResponsiveContainer>
        )}
      </div>

      {/* 52w range bar */}
      {quote && (
        <div className="px-6 pb-5 border-t border-border pt-4">
          <div className="flex items-center justify-between text-[10px] font-mono text-muted-foreground mb-1.5">
            <span>52W Low: {fmtPrice(quote.fiftyTwoWeekLow)}</span>
            <span className="text-foreground font-bold">52-Week Range</span>
            <span>52W High: {fmtPrice(quote.fiftyTwoWeekHigh)}</span>
          </div>
          <div className="relative h-2 rounded-full bg-accent overflow-hidden">
            <div className="absolute inset-y-0 left-0 rounded-full"
              style={{ width: `${Math.max(2, Math.min(98, w52range))}%`, background: lineColor }} />
          </div>
          <div className="mt-1 text-center text-[10px] font-mono text-muted-foreground">
            Currently at <span className="text-foreground">{w52range.toFixed(1)}%</span> of 52-week range
          </div>
        </div>
      )}
    </div>
  );
}

// Market dominance strip across the top
function MarketStrip() {
  const TOP = ["BTC-USD", "ETH-USD", "SOL-USD", "BNB-USD", "XRP-USD", "DOGE-USD"];
  const queries = TOP.map((s) => useQuery<Quote>({
    queryKey: ["crypto-quote", s],
    queryFn: () => apiFetch(`/api/stocks/${s}`),
    refetchInterval: 20000,
    staleTime: 10000,
  }));

  return (
    <div className="flex gap-4 overflow-x-auto pb-1 scrollbar-none">
      {TOP.map((sym, i) => {
        const coin = COINS.find(c => c.symbol === sym)!;
        const q = queries[i].data;
        const isUp = (q?.changePercent ?? 0) >= 0;
        return (
          <div key={sym} className="flex items-center gap-2 shrink-0 px-3 py-2 rounded-lg bg-card border border-border text-xs font-mono">
            <div className="w-5 h-5 rounded-full flex items-center justify-center text-[9px] font-black"
              style={{ background: `${coin.color}22`, color: coin.color }}>
              {coin.abbr[0]}
            </div>
            <span className="font-bold">{coin.abbr}</span>
            {q ? (
              <>
                <span>{fmtPrice(q.price)}</span>
                <span className={`font-bold ${isUp ? "text-emerald-400" : "text-red-400"}`}>{fmtPct(q.changePercent)}</span>
              </>
            ) : <Loader2 className="h-3 w-3 animate-spin text-muted-foreground" />}
          </div>
        );
      })}
    </div>
  );
}

// ── Bitcoin 4-Year Halving Cycle ──────────────────────────────────────────────
const HALVINGS = [
  { date: new Date("2012-11-28"), block: 210000,  reward: 25,    label: "1st Halving" },
  { date: new Date("2016-07-09"), block: 420000,  reward: 12.5,  label: "2nd Halving" },
  { date: new Date("2020-05-11"), block: 630000,  reward: 6.25,  label: "3rd Halving" },
  { date: new Date("2024-04-19"), block: 840000,  reward: 3.125, label: "4th Halving (current)" },
  { date: new Date("2028-04-01"), block: 1050000, reward: 1.5625,label: "5th Halving (est.)" },
];

const CYCLE_PHASES = [
  { label: "Accumulation",  days: [0, 365],    color: "#6366f1", desc: "Price consolidates after halving shock" },
  { label: "Bull Run",      days: [365, 548],   color: "#10b981", desc: "Retail FOMO begins, exponential gains" },
  { label: "Peak & Dist.",  days: [548, 730],   color: "#f59e0b", desc: "ATH zone, smart money distributes" },
  { label: "Bear Market",   days: [730, 1461],  color: "#ef4444", desc: "Correction & capitulation cycle" },
];

const CYCLE_RETURNS = [
  { cycle: "Cycle 1 (2012)", peakGain: "+92,000%", bottom: "$2",   peak: "$1,152",  duration: "371d to ATH" },
  { cycle: "Cycle 2 (2016)", peakGain: "+2,900%",  bottom: "$152", peak: "$19,764", duration: "525d to ATH" },
  { cycle: "Cycle 3 (2020)", peakGain: "+700%",    bottom: "$8.7k",peak: "$69,000", duration: "546d to ATH" },
  { cycle: "Cycle 4 (2024)", peakGain: "TBD",      bottom: "$60k", peak: "TBD",     duration: "In progress" },
];

function HalvingCycle() {
  const lastHalving = HALVINGS[3]; // Apr 19, 2024
  const nextHalving = HALVINGS[4]; // ~Apr 2028

  const now = Date.now();
  const daysSince = Math.floor((now - lastHalving.date.getTime()) / 86400000);
  const daysUntil  = Math.floor((nextHalving.date.getTime() - now) / 86400000);
  const cyclePct   = Math.min(100, (daysSince / 1461) * 100);

  const currentPhase = CYCLE_PHASES.find(p => daysSince >= p.days[0] && daysSince < p.days[1]) ?? CYCLE_PHASES[3];

  // 5y BTC history for the full chart
  const { data: histRaw = [] } = useQuery({
    queryKey: ["btc-5y-history"],
    queryFn: () => apiFetch("/api/stocks/BTC-USD/history?period=5y"),
    staleTime: 3600000,
  });

  const chartData = (histRaw as any[])
    .map((p: any) => ({
      t: new Date(p.date).getTime(),
      price: p.close ?? 0,
    }))
    .filter(p => p.price > 0);

  const minY = chartData.length ? Math.min(...chartData.map(p => p.price)) * 0.9 : 0;
  const maxY = chartData.length ? Math.max(...chartData.map(p => p.price)) * 1.05 : 1;

  // Halvings within the 5y window (June 2021+)
  const halvingLines = HALVINGS.filter(h => {
    const t = h.date.getTime();
    return t >= (chartData[0]?.t ?? 0) && t <= now;
  });

  const formatK = (v: number) => v >= 1000 ? `$${(v / 1000).toFixed(0)}k` : `$${v.toFixed(0)}`;

  return (
    <div className="mt-4 space-y-5">
      <div className="flex items-center gap-2">
        <div className="w-4 h-4 rounded-full bg-orange-500/20 border border-orange-500/50 flex items-center justify-center">
          <div className="w-2 h-2 rounded-full bg-orange-500" />
        </div>
        <h2 className="text-base font-bold font-mono">Bitcoin 4-Year Halving Cycle</h2>
        <span className="text-[10px] font-mono text-muted-foreground ml-1">· supply shock theory</span>
      </div>

      {/* Stats row */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {[
          { label: "Days Since Halving",  value: daysSince.toLocaleString(),  sub: "Apr 19, 2024",       color: "text-orange-400" },
          { label: "Days Until Next",     value: daysUntil.toLocaleString(),  sub: "~Apr 2028 (est.)",   color: "text-purple-400" },
          { label: "Cycle Progress",      value: `${cyclePct.toFixed(1)}%`,   sub: `of 1,461 days`,      color: "text-foreground" },
          { label: "Current Phase",       value: currentPhase.label,          sub: currentPhase.desc,    color: currentPhase.color as any },
        ].map(({ label, value, sub, color }) => (
          <div key={label} className="rounded-xl border border-border bg-card px-4 py-3">
            <p className="text-[10px] font-mono text-muted-foreground uppercase tracking-widest mb-1">{label}</p>
            <p className={`text-lg font-black font-mono ${color}`}>{value}</p>
            <p className="text-[10px] text-muted-foreground mt-0.5">{sub}</p>
          </div>
        ))}
      </div>

      {/* Phase progress bar */}
      <div className="rounded-xl border border-border bg-card px-5 py-4">
        <p className="text-[10px] font-mono text-muted-foreground uppercase tracking-widest mb-3">4-Year Cycle Phases</p>
        <div className="relative h-7 flex rounded-lg overflow-hidden gap-px">
          {CYCLE_PHASES.map((phase) => {
            const width = ((phase.days[1] - phase.days[0]) / 1461) * 100;
            const isActive = phase.label === currentPhase.label;
            return (
              <div key={phase.label} className="relative flex items-center justify-center text-[9px] font-mono font-bold transition-all"
                style={{ width: `${width}%`, background: `${phase.color}${isActive ? "50" : "18"}`, border: isActive ? `1.5px solid ${phase.color}` : "none" }}>
                <span style={{ color: phase.color }} className="truncate px-1">{phase.label}</span>
              </div>
            );
          })}
          {/* Current day cursor */}
          <div className="absolute top-0 bottom-0 w-0.5 bg-white/80 shadow-[0_0_6px_2px_rgba(255,255,255,0.4)]"
            style={{ left: `${cyclePct}%` }} />
        </div>
        <div className="flex justify-between text-[9px] font-mono text-muted-foreground mt-1.5">
          <span>Halving Day 0</span>
          <span className="text-white/60">↑ You are here (Day {daysSince})</span>
          <span>Day 1,461</span>
        </div>
      </div>

      {/* Historical chart with halving markers */}
      {chartData.length > 0 && (
        <div className="rounded-xl border border-border bg-card px-5 pt-4 pb-2">
          <p className="text-[10px] font-mono text-muted-foreground uppercase tracking-widest mb-3">BTC Price — Last 5 Years with Halvings</p>
          <div style={{ height: 220 }}>
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={chartData} margin={{ top: 4, right: 8, left: 0, bottom: 0 }}>
                <defs>
                  <linearGradient id="btcCycleGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%"  stopColor="#f7931a" stopOpacity={0.3} />
                    <stop offset="95%" stopColor="#f7931a" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.04)" />
                <XAxis dataKey="t" tickFormatter={(t) => new Date(t).toLocaleDateString([], { month: "short", year: "2-digit" })}
                  tick={{ fill: "#6b7280", fontSize: 9, fontFamily: "monospace" }} axisLine={false} tickLine={false} minTickGap={60} />
                <YAxis tickFormatter={formatK} tick={{ fill: "#6b7280", fontSize: 9, fontFamily: "monospace" }} axisLine={false} tickLine={false} domain={[minY, maxY]} width={46} />
                {halvingLines.map((h) => (
                  <ReferenceLine key={h.label} x={h.date.getTime()} stroke="#f7931a" strokeDasharray="5 3" strokeWidth={1.5}
                    label={{ value: h.label.split(" ")[0], fill: "#f7931a", fontSize: 8, fontFamily: "monospace", position: "insideTopRight" }} />
                ))}
                <ReferenceLine x={nextHalving.date.getTime()} stroke="#a855f7" strokeDasharray="5 3" strokeWidth={1.5}
                  label={{ value: "5th (est.)", fill: "#a855f7", fontSize: 8, fontFamily: "monospace", position: "insideTopRight" }} />
                <Tooltip
                  content={({ active, payload }) => {
                    if (!active || !payload?.length) return null;
                    const p = payload[0].value as number;
                    return (
                      <div className="rounded-lg border border-border bg-card px-3 py-2 text-xs font-mono shadow-xl">
                        <p className="font-bold">{formatK(p)}</p>
                        <p className="text-muted-foreground">{new Date(payload[0].payload.t).toLocaleDateString([], { month: "short", year: "numeric" })}</p>
                      </div>
                    );
                  }}
                />
                <Area type="monotone" dataKey="price" stroke="#f7931a" strokeWidth={2} fill="url(#btcCycleGrad)" dot={false} />
              </AreaChart>
            </ResponsiveContainer>
          </div>
          <div className="flex items-center gap-4 mt-2 text-[9px] font-mono text-muted-foreground">
            <span className="flex items-center gap-1"><span className="inline-block w-4 border-t border-dashed border-orange-400" /> Halving event</span>
            <span className="flex items-center gap-1"><span className="inline-block w-4 border-t border-dashed border-purple-400" /> Next halving (est.)</span>
          </div>
        </div>
      )}

      {/* Past cycle returns */}
      <div className="rounded-xl border border-border bg-card overflow-hidden">
        <div className="px-5 py-3 border-b border-border">
          <p className="text-[10px] font-mono text-muted-foreground uppercase tracking-widest">Historical Cycle Returns (Halving Day → Peak)</p>
        </div>
        <div className="divide-y divide-border">
          {CYCLE_RETURNS.map((c) => (
            <div key={c.cycle} className="px-5 py-3 flex items-center gap-4 text-xs font-mono">
              <span className="text-muted-foreground w-36 shrink-0">{c.cycle}</span>
              <span className="text-emerald-400 font-bold w-24 shrink-0">{c.peakGain}</span>
              <span className="text-muted-foreground shrink-0">Low: <span className="text-foreground">{c.bottom}</span></span>
              <span className="text-muted-foreground shrink-0">Peak: <span className="text-foreground">{c.peak}</span></span>
              <span className="text-muted-foreground ml-auto shrink-0">{c.duration}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

// ── Crypto News ───────────────────────────────────────────────────────────────
interface NewsItem {
  title: string; publisher: string; link: string;
  publishedAt: string; thumbnail?: string; summary?: string;
}

function CryptoNews({ symbol, coin }: { symbol: string; coin: typeof COINS[number] }) {
  const { data: news = [], isLoading } = useQuery<NewsItem[]>({
    queryKey: ["crypto-news", symbol],
    queryFn: () => apiFetch(`/api/stocks/${symbol}/news`),
    refetchInterval: 120000,
    staleTime: 60000,
  });

  const timeAgo = (iso: string) => {
    const diff = Date.now() - new Date(iso).getTime();
    const h = Math.floor(diff / 3600000);
    const m = Math.floor(diff / 60000);
    if (h >= 24) return `${Math.floor(h / 24)}d ago`;
    if (h >= 1) return `${h}h ago`;
    return `${m}m ago`;
  };

  return (
    <div className="mt-6">
      <div className="flex items-center gap-2 mb-4">
        <Newspaper className="h-4 w-4 text-muted-foreground" />
        <h2 className="text-base font-bold font-mono">
          Latest <span style={{ color: coin.color }}>{coin.abbr}</span> News
        </h2>
        <span className="text-[10px] font-mono text-muted-foreground ml-1">· why it moved</span>
      </div>

      {isLoading ? (
        <div className="flex items-center gap-2 text-muted-foreground py-8">
          <Loader2 className="h-4 w-4 animate-spin" /> Loading news…
        </div>
      ) : news.length === 0 ? (
        <p className="text-muted-foreground text-sm">No news found for {coin.abbr}.</p>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {news.map((item, i) => (
            <a
              key={i}
              href={item.link}
              target="_blank"
              rel="noopener noreferrer"
              className="group rounded-xl border border-border bg-card hover:border-border/80 hover:bg-accent/30 transition-all overflow-hidden flex flex-col"
            >
              {/* Thumbnail */}
              {item.thumbnail ? (
                <div className="h-36 overflow-hidden shrink-0">
                  <img
                    src={item.thumbnail}
                    alt=""
                    className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                    onError={(e) => { (e.target as HTMLImageElement).style.display = "none"; }}
                  />
                </div>
              ) : (
                <div className="h-20 shrink-0 flex items-center justify-center"
                  style={{ background: `${coin.color}10` }}>
                  <Bitcoin className="h-8 w-8 opacity-20" style={{ color: coin.color }} />
                </div>
              )}

              {/* Content */}
              <div className="flex flex-col flex-1 p-4 gap-2">
                <p className="text-sm font-bold leading-snug line-clamp-3 group-hover:text-foreground transition-colors">
                  {item.title}
                </p>
                {item.summary && (
                  <p className="text-[11px] text-muted-foreground line-clamp-2 leading-relaxed">
                    {item.summary}
                  </p>
                )}
                <div className="flex items-center justify-between mt-auto pt-2 border-t border-border/50">
                  <span className="text-[10px] font-mono text-muted-foreground font-bold uppercase tracking-wide truncate">
                    {item.publisher}
                  </span>
                  <div className="flex items-center gap-1 text-[10px] font-mono text-muted-foreground shrink-0">
                    <Clock className="h-2.5 w-2.5" />
                    {timeAgo(item.publishedAt)}
                    <ExternalLink className="h-2.5 w-2.5 ml-1 opacity-0 group-hover:opacity-60 transition-opacity" />
                  </div>
                </div>
              </div>
            </a>
          ))}
        </div>
      )}
    </div>
  );
}

export function CryptoPage() {
  const [activeSymbol, setActiveSymbol] = useState("BTC-USD");
  const activeCoin = COINS.find(c => c.symbol === activeSymbol) ?? COINS[0];

  return (
    <Layout>
      <div className="flex flex-col gap-4 pb-12">
        {/* Top strip */}
        <div>
          <div className="flex items-center gap-3 mb-3">
            <div className="p-2 rounded-lg border" style={{ background: `${activeCoin.color}15`, borderColor: `${activeCoin.color}40` }}>
              <Bitcoin className="h-5 w-5" style={{ color: activeCoin.color }} />
            </div>
            <div>
              <h1 className="text-xl font-bold font-mono tracking-tight">Crypto Markets</h1>
              <p className="text-xs text-muted-foreground">Live prices · 24/7 markets · real-time charts</p>
            </div>
          </div>
          <MarketStrip />
        </div>

        {/* Main grid: coin list | chart | stats — fixed height */}
        <div className="flex gap-4" style={{ height: "calc(100vh - 320px)", minHeight: 460 }}>
          {/* Coin list sidebar */}
          <div className="w-48 shrink-0 rounded-xl overflow-hidden flex flex-col" style={{ background: "rgba(12,15,25,0.7)", border: "1px solid rgba(255,255,255,0.07)" }}>
            <div className="px-4 py-3 border-b border-border/50 shrink-0">
              <p className="text-[10px] font-mono text-muted-foreground uppercase tracking-widest">Markets</p>
            </div>
            <div className="flex-1 overflow-y-auto divide-y divide-border/30">
              {COINS.map((coin) => (
                <CoinRow
                  key={coin.symbol}
                  {...coin}
                  isActive={activeSymbol === coin.symbol}
                  onClick={() => setActiveSymbol(coin.symbol)}
                />
              ))}
            </div>
          </div>

          {/* Chart panel */}
          <div className="flex-1 min-w-0 rounded-xl overflow-hidden flex flex-col" style={{ background: "rgba(12,15,25,0.7)", border: "1px solid rgba(255,255,255,0.07)" }}>
            <MainChart symbol={activeSymbol} color={activeCoin.color} />
          </div>

          {/* Stats panel */}
          <StatsPanel symbol={activeSymbol} coin={activeCoin} />
        </div>

        {/* ── BTC 4-Year Halving Cycle (BTC only) ── */}
        {activeSymbol === "BTC-USD" && <HalvingCycle />}

        {/* ── News section (scroll down to see) ── */}
        <CryptoNews symbol={activeSymbol} coin={activeCoin} />
      </div>
    </Layout>
  );
}

function StatsPanel({ symbol, coin }: { symbol: string; coin: typeof COINS[number] }) {
  const { data: quote } = useQuery<Quote>({
    queryKey: ["crypto-quote", symbol],
    queryFn: () => apiFetch(`/api/stocks/${symbol}`),
    refetchInterval: 20000,
    staleTime: 10000,
  });

  const isUp = (quote?.changePercent ?? 0) >= 0;

  const stats = quote ? [
    { label: "Price", value: fmtPrice(quote.price), highlight: true },
    { label: "24h Change", value: fmtPct(quote.changePercent), color: isUp ? "text-emerald-400" : "text-red-400" },
    { label: "24h High", value: fmtPrice(quote.high), color: "text-emerald-400" },
    { label: "24h Low",  value: fmtPrice(quote.low),  color: "text-red-400" },
    { label: "Open",     value: fmtPrice(quote.open) },
    { label: "Prev Close", value: fmtPrice(quote.previousClose) },
    { label: "Volume",   value: fmtLarge(quote.volume) },
    { label: "Mkt Cap",  value: quote.marketCap ? fmtLarge(quote.marketCap) : "—" },
    { label: "52W High", value: fmtPrice(quote.fiftyTwoWeekHigh), color: "text-emerald-400" },
    { label: "52W Low",  value: fmtPrice(quote.fiftyTwoWeekLow),  color: "text-red-400" },
  ] : [];

  return (
    <div className="w-48 shrink-0 rounded-xl border border-border bg-card overflow-hidden flex flex-col">
      <div className="px-4 py-3 border-b border-border shrink-0 flex items-center gap-2">
        <div className="w-5 h-5 rounded-full flex items-center justify-center text-[9px] font-black shrink-0"
          style={{ background: `${coin.color}22`, color: coin.color }}>
          {coin.abbr[0]}
        </div>
        <p className="text-xs font-bold font-mono">{coin.abbr}</p>
        <span className="text-[10px] text-muted-foreground">{coin.name}</span>
      </div>
      <div className="flex-1 overflow-y-auto px-4 py-3 space-y-3">
        {!quote ? (
          <div className="flex justify-center pt-8"><Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /></div>
        ) : (
          stats.map(({ label, value, color, highlight }) => (
            <div key={label}>
              <p className="text-[10px] font-mono text-muted-foreground uppercase tracking-widest">{label}</p>
              <p className={`text-sm font-mono font-bold mt-0.5 ${color ?? (highlight ? "text-foreground" : "text-foreground/80")}`}>{value}</p>
            </div>
          ))
        )}
      </div>

      {/* Change indicator */}
      {quote && (
        <div className={`px-4 py-3 border-t border-border flex items-center gap-2 ${isUp ? "bg-emerald-500/5" : "bg-red-500/5"}`}>
          {isUp
            ? <TrendingUp className="h-4 w-4 text-emerald-400 shrink-0" />
            : <TrendingDown className="h-4 w-4 text-red-400 shrink-0" />}
          <div>
            <p className={`text-xs font-mono font-bold ${isUp ? "text-emerald-400" : "text-red-400"}`}>
              {fmtPct(quote.changePercent)}
            </p>
            <p className="text-[9px] text-muted-foreground">24h change</p>
          </div>
        </div>
      )}
    </div>
  );
}
