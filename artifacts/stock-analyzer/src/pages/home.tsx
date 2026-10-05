import { useGetMarketMovers, getGetMarketMoversQueryKey } from "@workspace/api-client-react";
import { useQuery } from "@tanstack/react-query";
import { Link } from "wouter";
import { Layout } from "@/components/layout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ArrowUpRight, ArrowDownRight, TrendingUp, Activity, Zap, Newspaper, ExternalLink, Bot, RotateCcw, Cpu, Flame, HeartPulse, Landmark, ShoppingCart, Factory, Globe } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import { FearGreedGauge } from "@/components/fear-greed-gauge";
import type { MarketMover } from "@workspace/api-client-react";
import {
  AreaChart, Area, XAxis, YAxis, Tooltip,
  ResponsiveContainer, ReferenceLine,
} from "recharts";
import bullMascot from "/bull-mascot.png";
import bearMascot from "/bear-mascot.png";

const BASE = import.meta.env.BASE_URL.replace(/\/$/, "");
const apiFetch = (path: string) => fetch(`${BASE}${path}`).then(r => r.json());

const INDICES = [
  { symbol: "SPY",  label: "S&P 500",  color: "#10b981" },
  { symbol: "QQQ",  label: "NASDAQ",   color: "#6366f1" },
  { symbol: "IWM",  label: "Russell 2000", color: "#f59e0b" },
  { symbol: "DIA",  label: "Dow Jones", color: "#38bdf8" },
];

function IndexCard({ symbol, label, color }: { symbol: string; label: string; color: string }) {
  const { data: quote } = useQuery<any>({
    queryKey: ["quote", symbol],
    queryFn: () => apiFetch(`/api/stocks/${symbol}`),
    refetchInterval: 60_000,
  });

  const { data: rawHistory = [], isLoading } = useQuery<any[]>({
    queryKey: ["intraday-5m", symbol],
    queryFn: () => apiFetch(`/api/stocks/${symbol}/history?period=5m`),
    refetchInterval: 60_000,
    staleTime: 30_000,
  });

  // Filter to the most recent trading session (group by date prefix)
  const sessionData = (() => {
    if (!rawHistory.length) return [];
    const lastDate = rawHistory[rawHistory.length - 1].date.slice(0, 10);
    return rawHistory
      .filter(p => p.date.startsWith(lastDate) && p.close > 0)
      .map(p => ({ t: new Date(p.date).getTime(), price: p.close, volume: p.volume }));
  })();

  const open = sessionData[0]?.price ?? quote?.open ?? 0;
  const last = sessionData[sessionData.length - 1]?.price ?? quote?.price ?? 0;
  const sessionHigh = sessionData.length ? Math.max(...sessionData.map(p => p.price)) : quote?.high ?? 0;
  const sessionLow  = sessionData.length ? Math.min(...sessionData.map(p => p.price)) : quote?.low ?? 0;
  const pctChange   = quote?.changePercent ?? (open > 0 ? ((last - open) / open) * 100 : 0);
  const isUp        = pctChange >= 0;
  const lineColor   = isUp ? "#10b981" : "#ef4444";

  const minY = sessionData.length ? Math.min(...sessionData.map(p => p.price)) * 0.9995 : 0;
  const maxY = sessionData.length ? Math.max(...sessionData.map(p => p.price)) * 1.0005 : 1;

  const fmt = (n: number) => n >= 1000 ? `$${n.toFixed(0)}` : `$${n.toFixed(2)}`;

  return (
    <div className="rounded-xl border border-border bg-card overflow-hidden flex flex-col" style={{ borderColor: isLoading ? undefined : `${lineColor}30` }}>
      {/* Header */}
      <div className="px-4 pt-3 pb-1 flex items-start justify-between">
        <div>
          <div className="flex items-center gap-2">
            <span className="text-xs font-mono font-bold text-muted-foreground">{symbol}</span>
            <span className="text-[10px] text-muted-foreground/60">{label}</span>
          </div>
          {quote ? (
            <p className="text-xl font-black font-mono mt-0.5">{fmt(quote.price)}</p>
          ) : (
            <Skeleton className="h-7 w-24 mt-1" />
          )}
        </div>
        <div className="text-right shrink-0">
          {quote ? (
            <>
              <p className={`text-sm font-bold font-mono ${isUp ? "text-emerald-400" : "text-red-400"}`}>
                {isUp ? "▲" : "▼"} {Math.abs(pctChange).toFixed(2)}%
              </p>
              <p className={`text-xs font-mono ${isUp ? "text-emerald-400/70" : "text-red-400/70"}`}>
                {isUp ? "+" : ""}{(quote.change ?? 0).toFixed(2)}
              </p>
            </>
          ) : (
            <Skeleton className="h-8 w-16" />
          )}
        </div>
      </div>

      {/* Sparkline chart */}
      <div style={{ height: 90 }} className="px-0 mt-1">
        {isLoading ? (
          <div className="h-full flex items-center justify-center">
            <Skeleton className="h-full w-full rounded-none" />
          </div>
        ) : sessionData.length > 1 ? (
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={sessionData} margin={{ top: 2, right: 0, left: 0, bottom: 0 }}>
              <defs>
                <linearGradient id={`grad-${symbol}`} x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%"  stopColor={lineColor} stopOpacity={0.25} />
                  <stop offset="95%" stopColor={lineColor} stopOpacity={0} />
                </linearGradient>
              </defs>
              <XAxis dataKey="t" hide />
              <YAxis hide domain={[minY, maxY]} />
              <ReferenceLine y={open} stroke="rgba(255,255,255,0.2)" strokeDasharray="3 3" strokeWidth={1} />
              <Tooltip
                content={({ active, payload }) => {
                  if (!active || !payload?.length) return null;
                  const p = payload[0].payload;
                  return (
                    <div className="rounded border border-border bg-card px-2 py-1 text-[10px] font-mono shadow-lg">
                      <p className="font-bold">{fmt(p.price)}</p>
                      <p className="text-muted-foreground">{new Date(p.t).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}</p>
                    </div>
                  );
                }}
              />
              <Area type="monotone" dataKey="price" stroke={lineColor} strokeWidth={1.5} fill={`url(#grad-${symbol})`} dot={false} />
            </AreaChart>
          </ResponsiveContainer>
        ) : (
          <div className="h-full flex items-center justify-center text-[10px] text-muted-foreground font-mono">
            Market closed
          </div>
        )}
      </div>

      {/* Footer stats */}
      <div className="px-4 pb-3 pt-1 flex items-center justify-between text-[10px] font-mono text-muted-foreground border-t border-border/40">
        <span>O <span className="text-foreground/70">{fmt(open)}</span></span>
        <span>H <span className="text-emerald-400/80">{fmt(sessionHigh)}</span></span>
        <span>L <span className="text-red-400/80">{fmt(sessionLow)}</span></span>
        <span>
          Vol{" "}
          <span className="text-foreground/70">
            {quote?.volume
              ? quote.volume >= 1e6
                ? `${(quote.volume / 1e6).toFixed(1)}M`
                : `${(quote.volume / 1e3).toFixed(0)}K`
              : "—"}
          </span>
        </span>
      </div>
    </div>
  );
}

/* ── Market Mascot ─────────────────────────────────────────────── */
function MarketMascot() {
  const { data: spy } = useQuery<any>({
    queryKey: ["quote", "SPY"],
    queryFn: () => apiFetch(`/api/stocks/SPY`),
    refetchInterval: 60_000,
  });
  const { data: qqq } = useQuery<any>({
    queryKey: ["quote", "QQQ"],
    queryFn: () => apiFetch(`/api/stocks/QQQ`),
    refetchInterval: 60_000,
  });

  const spyPct = spy?.changePercent ?? 0;
  const qqqPct = qqq?.changePercent ?? 0;
  const avgPct = (spyPct + qqqPct) / 2;
  const isBull = avgPct >= 0;
  const isLoaded = spy != null && qqq != null;

  const color   = isBull ? "#4edea3" : "#ff5451";
  const bgGlow  = isBull ? "rgba(78,222,163,0.06)" : "rgba(255,84,81,0.06)";
  const border  = isBull ? "rgba(78,222,163,0.15)" : "rgba(255,84,81,0.15)";
  const label   = isBull ? "BULL DAY" : "BEAR DAY";
  const sublabel = isBull
    ? "Markets are climbing. Momentum is on your side."
    : "Markets are under pressure. Stay disciplined.";

  return (
    <div
      className="relative overflow-hidden rounded-2xl flex items-center"
      style={{
        background: bgGlow,
        border: `1px solid ${border}`,
        minHeight: 220,
      }}
    >
      {/* Background grid lines */}
      <div
        className="absolute inset-0 opacity-[0.04]"
        style={{
          backgroundImage: `linear-gradient(${color} 1px, transparent 1px), linear-gradient(90deg, ${color} 1px, transparent 1px)`,
          backgroundSize: "40px 40px",
        }}
      />

      {/* Left — text content */}
      <div className="relative z-10 flex-1 px-8 py-6">
        {isLoaded ? (
          <>
            <div className="flex items-center gap-2 mb-1">
              <span
                className="w-2 h-2 rounded-full animate-pulse"
                style={{ background: color, boxShadow: `0 0 8px ${color}` }}
              />
              <span className="text-[10px] font-mono uppercase tracking-widest" style={{ color }}>
                General Market · Live
              </span>
            </div>
            <h2
              className="text-5xl font-black font-sans uppercase tracking-tight leading-none mb-3"
              style={{ color }}
            >
              {label}
            </h2>
            <p className="text-sm text-slate-400 mb-5 max-w-xs leading-relaxed">{sublabel}</p>

            {/* SPY / QQQ chips */}
            <div className="flex items-center gap-3 flex-wrap">
              {[
                { sym: "SPY", label: "S&P 500", pct: spyPct },
                { sym: "QQQ", label: "NASDAQ",  pct: qqqPct },
              ].map(({ sym, label: l, pct }) => {
                const up = pct >= 0;
                const c  = up ? "#4edea3" : "#ff5451";
                return (
                  <div
                    key={sym}
                    className="flex items-center gap-2 px-3 py-1.5 rounded-lg"
                    style={{ background: `${c}12`, border: `1px solid ${c}30` }}
                  >
                    <span className="text-xs font-mono font-black" style={{ color: c }}>{sym}</span>
                    <span className="text-[10px] text-slate-500">{l}</span>
                    <span className="text-xs font-mono font-bold" style={{ color: c }}>
                      {up ? "+" : ""}{pct.toFixed(2)}%
                    </span>
                  </div>
                );
              })}
              <div
                className="flex items-center gap-2 px-3 py-1.5 rounded-lg"
                style={{ background: `${color}12`, border: `1px solid ${color}30` }}
              >
                <span className="text-[10px] text-slate-500">Avg</span>
                <span className="text-xs font-mono font-black" style={{ color }}>
                  {avgPct >= 0 ? "+" : ""}{avgPct.toFixed(2)}%
                </span>
              </div>
            </div>
          </>
        ) : (
          <div className="space-y-3">
            <Skeleton className="h-12 w-48" />
            <Skeleton className="h-4 w-72" />
            <div className="flex gap-3">
              <Skeleton className="h-8 w-24" />
              <Skeleton className="h-8 w-24" />
            </div>
          </div>
        )}
      </div>

      {/* Right — mascot image */}
      <div
        className="relative shrink-0 self-end"
        style={{ width: 260, height: 260 }}
      >
        {/* glow blob behind mascot */}
        <div
          className="absolute bottom-0 right-8 w-48 h-48 rounded-full blur-3xl opacity-20"
          style={{ background: color }}
        />
        <img
          src={isBull ? bullMascot : bearMascot}
          alt={isBull ? "Bull" : "Bear"}
          className="absolute bottom-0 right-0 h-full w-full object-contain object-bottom drop-shadow-2xl"
          style={{
            filter: `drop-shadow(0 0 24px ${color}50)`,
            transition: "opacity 0.4s ease",
          }}
        />
      </div>
    </div>
  );
}

/* ── Market News Feed ──────────────────────────────────────────── */
function MarketNewsFeed() {
  const { data, isLoading } = useQuery<any>({
    queryKey: ["market-summary"],
    queryFn: () => apiFetch(`/api/market-summary`),
    staleTime: 15 * 60_000,
    refetchInterval: 15 * 60_000,
  });

  const summary: string = data?.summary ?? "";
  const headlines: any[] = data?.topHeadlines ?? [];

  const fmt = (iso: string) => {
    const d = new Date(iso);
    const now = Date.now();
    const diff = Math.floor((now - d.getTime()) / 60_000);
    if (diff < 60) return `${diff}m ago`;
    if (diff < 1440) return `${Math.floor(diff / 60)}h ago`;
    return d.toLocaleDateString([], { month: "short", day: "numeric" });
  };

  return (
    <div className="grid gap-4 lg:grid-cols-3">
      {/* AI Summary card */}
      <div
        className="lg:col-span-1 rounded-xl p-4 flex flex-col gap-3"
        style={{
          background: "rgba(173,198,255,0.04)",
          border: "1px solid rgba(173,198,255,0.12)",
        }}
      >
        <div className="flex items-center gap-2">
          <Bot className="h-4 w-4 text-blue-400 shrink-0" />
          <span className="text-[11px] font-bold font-sans uppercase tracking-widest text-blue-400">
            AI Market Pulse
          </span>
        </div>

        {isLoading ? (
          <div className="space-y-2 flex-1">
            <Skeleton className="h-3 w-full" />
            <Skeleton className="h-3 w-full" />
            <Skeleton className="h-3 w-4/5" />
            <Skeleton className="h-3 w-full mt-1" />
            <Skeleton className="h-3 w-3/4" />
          </div>
        ) : summary ? (
          <p className="text-sm text-slate-300 leading-relaxed font-['Inter'] flex-1">
            {summary}
          </p>
        ) : (
          <p className="text-sm text-slate-500 italic flex-1">Generating market summary…</p>
        )}

        {data?.generatedAt && (
          <p className="text-[9px] text-slate-600 font-mono uppercase tracking-wider">
            Updated {fmt(data.generatedAt)} · Powered by GPT-4.1
          </p>
        )}
      </div>

      {/* Headlines list */}
      <div
        className="lg:col-span-2 rounded-xl overflow-hidden"
        style={{ border: "1px solid rgba(255,255,255,0.06)" }}
      >
        <div className="px-4 py-3 flex items-center gap-2" style={{ background: "rgba(255,255,255,0.02)", borderBottom: "1px solid rgba(255,255,255,0.05)" }}>
          <Newspaper className="h-3.5 w-3.5 text-slate-400" />
          <span className="text-[11px] font-bold font-sans uppercase tracking-widest text-slate-400">
            Top Headlines
          </span>
          <span className="text-[9px] text-slate-600 font-mono ml-auto uppercase tracking-wider">Live · 15 min cache</span>
        </div>

        {isLoading ? (
          <div className="divide-y divide-white/5">
            {[...Array(5)].map((_, i) => (
              <div key={i} className="px-4 py-3 flex gap-3">
                <div className="flex-1 space-y-1.5">
                  <Skeleton className="h-3 w-full" />
                  <Skeleton className="h-3 w-3/4" />
                  <Skeleton className="h-2.5 w-20" />
                </div>
                <Skeleton className="h-12 w-16 rounded shrink-0" />
              </div>
            ))}
          </div>
        ) : (
          <div className="divide-y divide-white/[0.04]">
            {headlines.slice(0, 6).map((h, i) => (
              <a
                key={i}
                href={h.link}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-start gap-3 px-4 py-3 hover:bg-white/[0.03] transition-colors group"
              >
                {h.thumbnail && (
                  <img
                    src={h.thumbnail}
                    alt=""
                    className="w-16 h-11 object-cover rounded shrink-0 opacity-80 group-hover:opacity-100 transition-opacity"
                    onError={e => { (e.target as HTMLImageElement).style.display = "none"; }}
                  />
                )}
                <div className="flex-1 min-w-0">
                  <p className="text-[12px] font-medium text-slate-200 leading-snug group-hover:text-white transition-colors line-clamp-2">
                    {h.title}
                  </p>
                  <div className="flex items-center gap-2 mt-1">
                    <span className="text-[9px] text-slate-600 font-mono uppercase tracking-wider">{h.publisher}</span>
                    <span className="text-[9px] text-slate-700">·</span>
                    <span className="text-[9px] text-slate-600 font-mono">{fmt(h.publishedAt)}</span>
                  </div>
                </div>
                <ExternalLink className="h-3 w-3 text-slate-700 shrink-0 mt-0.5 group-hover:text-slate-400 transition-colors" />
              </a>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

/* ── Sector Rotation widget ────────────────────────────────── */
const SECTOR_META: Record<string, { label: string; icon: any; color: string }> = {
  all:        { label: "All Markets",  icon: Globe,        color: "#adc6ff" },
  tech:       { label: "Technology",   icon: Cpu,          color: "#818cf8" },
  energy:     { label: "Energy",       icon: Flame,        color: "#fb923c" },
  health:     { label: "Healthcare",   icon: HeartPulse,   color: "#34d399" },
  finance:    { label: "Financials",   icon: Landmark,     color: "#38bdf8" },
  consumer:   { label: "Consumer",     icon: ShoppingCart, color: "#f472b6" },
  industrial: { label: "Industrials",  icon: Factory,      color: "#a78bfa" },
};

function SectorRotation() {
  const { data, isLoading } = useQuery<Record<string, { etf: string; changePercent: number; price: number }>>({
    queryKey: ["sector-sentiment"],
    queryFn: () => fetch(`${BASE}/api/sector-sentiment`).then(r => r.json()),
    staleTime: 5 * 60 * 1000,
    refetchInterval: 5 * 60 * 1000,
  });

  const ranked = data
    ? Object.entries(data)
        .map(([id, v]) => ({ id, ...v, ...SECTOR_META[id] }))
        .sort((a, b) => b.changePercent - a.changePercent)
    : [];

  const maxAbs = ranked.length ? Math.max(...ranked.map(r => Math.abs(r.changePercent)), 0.01) : 1;

  return (
    <div className="rounded-xl border border-border/60 bg-card overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-border/40" style={{ background: "rgba(255,255,255,0.02)" }}>
        <div className="flex items-center gap-2">
          <RotateCcw className="h-4 w-4 text-primary" />
          <span className="text-sm font-bold font-mono uppercase tracking-wider">Sector Rotation</span>
          <span className="text-[10px] font-mono text-muted-foreground/60">· ranked by today's flow</span>
        </div>
        <span className="text-[10px] font-mono text-muted-foreground/50 uppercase tracking-widest">Daily %</span>
      </div>

      {/* Rows */}
      <div className="divide-y divide-border/20">
        {isLoading && [...Array(7)].map((_, i) => (
          <div key={i} className="flex items-center gap-3 px-4 py-3">
            <Skeleton className="h-4 w-4 rounded" />
            <Skeleton className="h-3 w-28" />
            <div className="flex-1" />
            <Skeleton className="h-2 w-32 rounded-full" />
            <Skeleton className="h-4 w-14 rounded" />
          </div>
        ))}

        {ranked.map((s, idx) => {
          const up = s.changePercent >= 0;
          const barPct = (Math.abs(s.changePercent) / maxAbs) * 100;
          const Icon = s.icon ?? Globe;
          const rankColor = idx === 0 ? "#4edea3" : idx === ranked.length - 1 ? "#ff5451" : undefined;

          return (
            <Link key={s.id} href="/news" className="group flex items-center gap-3 px-4 py-2.5 hover:bg-accent/10 transition-colors cursor-pointer">
              {/* Rank */}
              <span
                className="text-[11px] font-mono font-bold w-4 text-center shrink-0"
                style={{ color: rankColor ?? (up ? "#4edea3" : "#ff5451"), opacity: rankColor ? 1 : 0.5 }}
              >
                {idx + 1}
              </span>

              {/* Icon + name */}
              <Icon className="h-3.5 w-3.5 shrink-0" style={{ color: s.color }} />
              <div className="flex flex-col min-w-0 w-28 shrink-0">
                <span className="text-xs font-semibold truncate group-hover:text-primary transition-colors">{s.label}</span>
                <span className="text-[10px] font-mono text-muted-foreground/60">{s.etf} · ${s.price.toFixed(2)}</span>
              </div>

              {/* Flow direction label */}
              <span className={`text-[9px] font-mono font-bold uppercase tracking-widest shrink-0 w-16 ${up ? "text-emerald-500" : "text-red-500"}`}>
                {up ? "↑ inflow" : "↓ outflow"}
              </span>

              {/* Bar */}
              <div className="flex-1 flex items-center gap-1.5 min-w-0">
                {/* Negative side (left, red) */}
                <div className="flex-1 flex justify-end">
                  {!up && (
                    <div
                      className="h-2 rounded-full transition-all duration-700"
                      style={{
                        width: `${barPct}%`,
                        background: `rgba(255,84,81,${0.3 + (barPct / 100) * 0.7})`,
                        boxShadow: barPct > 60 ? "0 0 6px rgba(255,84,81,0.4)" : undefined,
                      }}
                    />
                  )}
                </div>
                {/* Center divider */}
                <div className="w-px h-3 bg-border/40 shrink-0" />
                {/* Positive side (right, green) */}
                <div className="flex-1">
                  {up && (
                    <div
                      className="h-2 rounded-full transition-all duration-700"
                      style={{
                        width: `${barPct}%`,
                        background: `rgba(78,222,163,${0.3 + (barPct / 100) * 0.7})`,
                        boxShadow: barPct > 60 ? "0 0 6px rgba(78,222,163,0.4)" : undefined,
                      }}
                    />
                  )}
                </div>
              </div>

              {/* % badge */}
              <span
                className="text-xs font-mono font-bold shrink-0 w-16 text-right tabular-nums"
                style={{ color: up ? "#4edea3" : "#ff5451" }}
              >
                {up ? "+" : ""}{s.changePercent.toFixed(2)}%
              </span>

              {/* Arrow */}
              {up
                ? <ArrowUpRight className="h-3.5 w-3.5 text-emerald-400/50 shrink-0 group-hover:text-emerald-400 transition-colors" />
                : <ArrowDownRight className="h-3.5 w-3.5 text-red-400/50 shrink-0 group-hover:text-red-400 transition-colors" />
              }
            </Link>
          );
        })}
      </div>

      {/* Footer */}
      {ranked.length > 0 && (
        <div className="px-4 py-2 border-t border-border/20 flex items-center justify-between" style={{ background: "rgba(255,255,255,0.01)" }}>
          <span className="text-[10px] font-mono text-muted-foreground/40">Bars show relative magnitude · refreshes every 5 min</span>
          <Link href="/news" className="text-[10px] font-mono text-primary/50 hover:text-primary transition-colors">
            View sector news →
          </Link>
        </div>
      )}
    </div>
  );
}

function IndexMiniCharts() {
  return (
    <div>
      <div className="flex items-center gap-2 mb-3">
        <Activity className="h-4 w-4 text-blue-400" />
        <h2 className="text-sm font-semibold">Index Performance</h2>
        <span className="text-[10px] text-muted-foreground font-mono">· intraday · 5m bars</span>
      </div>
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        {INDICES.map(idx => (
          <IndexCard key={idx.symbol} {...idx} />
        ))}
      </div>
    </div>
  );
}

function MoverCard({ title, icon: Icon, color, data, isLoading }: {
  title: string;
  icon: any;
  color: string;
  data?: MarketMover[];
  isLoading: boolean;
}) {
  return (
    <Card className="h-full">
      <CardHeader className="flex flex-row items-center justify-between pb-3 space-y-0">
        <CardTitle className="text-sm font-semibold flex items-center gap-2">
          <Icon className={`h-4 w-4 ${color}`} />
          {title}
        </CardTitle>
      </CardHeader>
      <CardContent className="p-0">
        {isLoading ? (
          <div className="px-4 pb-4 space-y-3">
            {[...Array(6)].map((_, i) => (
              <div key={i} className="flex justify-between items-center">
                <Skeleton className="h-5 w-[70px]" />
                <Skeleton className="h-5 w-[90px]" />
              </div>
            ))}
          </div>
        ) : data && data.length > 0 ? (
          <div className="divide-y divide-border/30">
            {data.slice(0, 8).map((stock) => {
              const isPositive = stock.changePercent >= 0;
              return (
                <Link
                  key={stock.symbol}
                  href={`/stock/${stock.symbol}`}
                  className="flex items-center justify-between px-4 py-2.5 hover:bg-accent/20 transition-colors cursor-pointer group"
                >
                  <div className="flex flex-col min-w-0">
                    <span className="font-mono font-bold text-sm group-hover:text-primary transition-colors">{stock.symbol}</span>
                    <span className="text-xs text-muted-foreground max-w-[140px] truncate">{stock.name}</span>
                  </div>
                  <div className="flex flex-col items-end shrink-0 ml-2">
                    <span className="font-mono text-sm font-medium">${stock.price.toFixed(2)}</span>
                    <span className={`font-mono text-xs font-bold flex items-center ${isPositive ? "text-emerald-400" : "text-red-400"}`}>
                      {isPositive ? <ArrowUpRight className="h-3 w-3" /> : <ArrowDownRight className="h-3 w-3" />}
                      {isPositive ? "+" : ""}{stock.changePercent.toFixed(2)}%
                    </span>
                  </div>
                </Link>
              );
            })}
          </div>
        ) : (
          <p className="text-sm text-muted-foreground py-6 text-center px-4">No data available.</p>
        )}
      </CardContent>
    </Card>
  );
}

export function Home() {
  const { data: movers, isLoading } = useGetMarketMovers({
    query: { queryKey: getGetMarketMoversQueryKey(), refetchInterval: 60_000 }
  });

  return (
    <Layout>
      <div className="space-y-6">
        {/* Page header — regime pill from QUANT-GLASS reference */}
        <div className="flex justify-between items-end gap-4">
          <div className="flex flex-col gap-1">
            <h1 className="text-3xl font-bold tracking-tight font-sans uppercase tracking-tight flex items-center gap-3">
              <Zap className="h-7 w-7 text-emerald-400 shrink-0" />
              Market Movers
            </h1>
            <p className="text-muted-foreground text-sm">Live daily performance — top gainers, losers &amp; most active.</p>
          </div>
          <div
            className="regime-pill hidden sm:flex items-center gap-2 px-4 py-2 rounded-lg shrink-0"
          >
            <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" style={{ boxShadow: "0 0 6px #4edea3" }} />
            <div className="flex flex-col items-end">
              <span className="text-[9px] font-mono text-slate-500 uppercase tracking-widest leading-none">Current Regime</span>
              <span className="text-xs font-bold text-emerald-400 font-sans uppercase tracking-wider leading-none mt-0.5">RISK-ON</span>
            </div>
          </div>
        </div>

        <MarketMascot />

        <MarketNewsFeed />

        <IndexMiniCharts />

        <SectorRotation />

        <div className="grid gap-4 lg:grid-cols-4">
          {/* Movers — take up 3 cols */}
          <div className="lg:col-span-3 grid gap-4 sm:grid-cols-3">
            <MoverCard
              title="Top Gainers"
              icon={TrendingUp}
              color="text-emerald-400"
              data={movers?.gainers}
              isLoading={isLoading}
            />
            <MoverCard
              title="Top Losers"
              icon={ArrowDownRight}
              color="text-red-400"
              data={movers?.losers}
              isLoading={isLoading}
            />
            <MoverCard
              title="Most Active"
              icon={Activity}
              color="text-blue-400"
              data={movers?.mostActive}
              isLoading={isLoading}
            />
          </div>

          {/* Fear & Greed — right column */}
          <div className="lg:col-span-1">
            <FearGreedGauge />
          </div>
        </div>

      </div>
    </Layout>
  );
}
