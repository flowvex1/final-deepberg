import { useQuery } from "@tanstack/react-query";
import { useLocation } from "wouter";
import { Layout } from "@/components/layout";
import {
  TrendingUp,
  TrendingDown,
  Minus,
  Radio,
  RefreshCw,
  ExternalLink,
  Zap,
  ShieldAlert,
  Flame,
} from "lucide-react";
import { Link } from "wouter";
import React, { useState } from "react";

const BASE = import.meta.env.BASE_URL.replace(/\/$/, "");

/* ── Types ─────────────────────────────────────────── */
interface Signal {
  symbol: string;
  companyName: string;
  price: number;
  changePercent: number;
  signalType: string;
  direction: "bullish" | "bearish" | "neutral";
  strength: number;
  headline: string;
  detail: string;
  metrics: Record<string, string>;
  category: "invest" | "options";
}
interface SignalsResponse {
  invest: Signal[];
  options: Signal[];
  generatedAt: string;
}

/* ── Signal type config ─────────────────────────────── */
const SIGNAL_CFG: Record<
  string,
  { icon: React.ElementType; color: string; bg: string; border: string }
> = {
  "Momentum Breakout": {
    icon: Zap,
    color: "text-emerald-400",
    bg: "bg-emerald-500/10",
    border: "border-emerald-500/30",
  },
  "Volume Surge": {
    icon: TrendingUp,
    color: "text-blue-400",
    bg: "bg-blue-500/10",
    border: "border-blue-500/30",
  },
  "Near 52-Week High": {
    icon: TrendingUp,
    color: "text-violet-400",
    bg: "bg-violet-500/10",
    border: "border-violet-500/30",
  },
  "Oversold Bounce": {
    icon: TrendingUp,
    color: "text-amber-400",
    bg: "bg-amber-500/10",
    border: "border-amber-500/30",
  },
  "Trending Up": {
    icon: TrendingUp,
    color: "text-emerald-400",
    bg: "bg-emerald-500/10",
    border: "border-emerald-500/30",
  },
  "Pre-Earnings Setup": {
    icon: Flame,
    color: "text-orange-400",
    bg: "bg-orange-500/10",
    border: "border-orange-500/30",
  },
  "Call Opportunity": {
    icon: Zap,
    color: "text-emerald-400",
    bg: "bg-emerald-500/10",
    border: "border-emerald-500/30",
  },
  "Short Squeeze Watch": {
    icon: Zap,
    color: "text-red-400",
    bg: "bg-red-500/10",
    border: "border-red-500/30",
  },
  "Put Opportunity": {
    icon: TrendingDown,
    color: "text-red-400",
    bg: "bg-red-500/10",
    border: "border-red-500/30",
  },
  "Premium Selling Setup": {
    icon: ShieldAlert,
    color: "text-indigo-400",
    bg: "bg-indigo-500/10",
    border: "border-indigo-500/30",
  },
};

const DIR_COLOR = {
  bullish: "text-emerald-400",
  bearish: "text-red-400",
  neutral: "text-muted-foreground",
} as const;

/* ── Strength bar ───────────────────────────────────── */
function StrengthBar({ value }: { value: number }) {
  const color =
    value >= 75
      ? "bg-emerald-500"
      : value >= 55
        ? "bg-amber-500"
        : "bg-blue-500";
  const label =
    value >= 80
      ? "Very strong"
      : value >= 65
        ? "Strong"
        : value >= 50
          ? "Moderate"
          : "Developing";
  return (
    <div className="space-y-1">
      <div className="flex justify-between text-[10px] font-mono text-muted-foreground">
        <span>Signal strength</span>
        <span
          className={`font-bold ${value >= 75 ? "text-emerald-400" : value >= 55 ? "text-amber-400" : "text-blue-400"}`}
        >
          {value} — {label}
        </span>
      </div>
      <div className="relative h-1.5 rounded-full bg-muted overflow-hidden">
        <div
          className={`h-full rounded-full ${color} transition-all duration-700`}
          style={{ width: `${value}%` }}
        />
      </div>
    </div>
  );
}
/* ── Signal card ────────────────────────────────────── */
function SignalCard({ signal }: { signal: Signal }) {
  const cfg = SIGNAL_CFG[signal.signalType] ?? {
    icon: Radio,
    color: "text-primary",
    bg: "bg-primary/10",
    border: "border-primary/30",
  };
  const Icon = cfg.icon;
  const DirIcon =
    signal.direction === "bullish"
      ? TrendingUp
      : signal.direction === "bearish"
        ? TrendingDown
        : Minus;

  return (
    <div
      className={`rounded-xl border ${cfg.border} ${cfg.bg} p-4 flex flex-col gap-3 hover:brightness-110 transition-all`}
    >
      {/* Top row: symbol + type badge */}
      <div className="flex items-start justify-between gap-2">
        <div className="flex items-center gap-2">
          <div
            className={`flex items-center justify-center h-8 w-8 rounded-lg border ${cfg.border} ${cfg.bg}`}
          >
            <Icon className={`h-4 w-4 ${cfg.color}`} />
          </div>
          <div>
            <div className="flex items-center gap-1.5">
              <span className="font-bold font-mono text-base">
                {signal.symbol}
              </span>
              <DirIcon
                className={`h-3.5 w-3.5 ${DIR_COLOR[signal.direction]}`}
              />
            </div>
            <p className="text-[11px] text-muted-foreground leading-none">
              {signal.companyName}
            </p>
          </div>
        </div>
        <div className="flex flex-col items-end gap-1 shrink-0">
          <span
            className={`text-xs font-bold font-mono px-2 py-0.5 rounded-full border ${cfg.border} ${cfg.color}`}
          >
            {signal.signalType}
          </span>
          <span
            className={`text-xs font-bold font-mono ${signal.changePercent >= 0 ? "text-emerald-400" : "text-red-400"}`}
          >
            {signal.changePercent >= 0 ? "+" : ""}
            {signal.changePercent.toFixed(2)}%
          </span>
        </div>
      </div>

      {/* Headline */}
      <p className="text-sm font-medium leading-snug text-foreground/90">
        {signal.headline}
      </p>

      {/* Strength */}
      <StrengthBar value={signal.strength} />

      {/* Plain-English detail */}
      <p className="text-xs text-muted-foreground leading-relaxed">
        {signal.detail}
      </p>

      {/* Metrics chips */}
      <div className="flex flex-wrap gap-1.5">
        {Object.entries(signal.metrics).map(([k, v]) => (
          <span
            key={k}
            className="text-[10px] font-mono px-2 py-0.5 rounded-md bg-muted/40 border border-border/50"
          >
            <span className="text-muted-foreground">{k}: </span>
            <span className="text-foreground font-bold">{v}</span>
          </span>
        ))}
        <span className="text-[10px] font-mono px-2 py-0.5 rounded-md bg-muted/40 border border-border/50 font-bold">
          ${signal.price.toFixed(2)}
        </span>
      </div>

      {/* View stock link */}
      <Link
        href={`/stock/${signal.symbol}`}
        className="flex items-center gap-1 text-[11px] font-mono text-primary hover:text-primary/80 transition-colors mt-auto"
      >
        <ExternalLink className="h-3 w-3" />
        View full chart & analysis
      </Link>
    </div>
  );
}

/* ── Loading skeleton ───────────────────────────────── */
function SignalSkeleton() {
  return (
    <div className="rounded-xl border border-border/40 bg-muted/10 p-4 space-y-3 animate-pulse">
      <div className="flex items-center gap-2">
        <div className="h-8 w-8 rounded-lg bg-muted/40" />
        <div className="space-y-1.5 flex-1">
          <div className="h-4 w-16 rounded bg-muted/40" />
          <div className="h-3 w-24 rounded bg-muted/30" />
        </div>
        <div className="h-5 w-28 rounded-full bg-muted/40" />
      </div>
      <div className="h-4 w-full rounded bg-muted/30" />
      <div className="h-4 w-3/4 rounded bg-muted/30" />
      <div className="h-2 rounded-full bg-muted/30" />
      <div className="h-10 rounded bg-muted/20" />
    </div>
  );
}

/* ── Empty state ────────────────────────────────────── */
function EmptyState({ category }: { category: string }) {
  return (
    <div className="col-span-full flex flex-col items-center justify-center py-16 text-center gap-3">
      <Radio className="h-10 w-10 text-muted-foreground/30" />
      <p className="text-muted-foreground font-mono text-sm">
        No {category} signals detected right now.
      </p>
      <p className="text-muted-foreground/60 text-xs">
        The market may be quiet — check back when things are moving.
      </p>
    </div>
  );
}

/* ── Main page ──────────────────────────────────────── */
export function SignalsPage() {
  const [location] = useLocation();
  const isOptions = location.startsWith("/options-signals");

  const [tab, setTab] = useState<"invest" | "options">(
    isOptions ? "options" : "invest",
  );

  const { data, isLoading, error, refetch, isFetching, dataUpdatedAt } =
    useQuery<SignalsResponse>({
      queryKey: ["signals"],
      queryFn: async () => {
        const res = await fetch(`${BASE}/api/signals`);
        if (!res.ok) throw new Error("Failed to load signals");
        return res.json();
      },
      refetchInterval: 5 * 60 * 1000,
      staleTime: 4 * 60 * 1000,
    });

  const signals =
    tab === "invest" ? (data?.invest ?? []) : (data?.options ?? []);

  return (
    <Layout>
      <div className="space-y-6">
        {/* ── Header ──────────────────────────────────── */}
        <div className="flex items-start gap-4 flex-wrap">
          <div className="flex items-center justify-center h-12 w-12 rounded-2xl bg-primary/15 border border-primary/30 shrink-0">
            <Radio className="h-6 w-6 text-primary" />
          </div>
          <div className="flex-1 min-w-0">
            <h1 className="text-2xl font-bold font-mono">Live Signals</h1>
            <p className="text-sm text-muted-foreground mt-0.5">
              Real-time opportunities spotted across the market — updated every
              5 minutes
            </p>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            {dataUpdatedAt > 0 && (
              <span className="text-[11px] font-mono text-muted-foreground/50">
                Updated {new Date(dataUpdatedAt).toLocaleTimeString()}
              </span>
            )}
            <button
              onClick={() => refetch()}
              disabled={isFetching}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-md border border-border text-xs font-mono text-muted-foreground hover:text-foreground transition-colors disabled:opacity-40"
            >
              <RefreshCw
                className={`h-3 w-3 ${isFetching ? "animate-spin" : ""}`}
              />
              Refresh
            </button>
          </div>
        </div>

        {/* ── Tab switcher ────────────────────────────── */}
        <div className="flex items-center gap-1 rounded-xl border border-border bg-card p-1 w-fit">
          {(
            [
              {
                id: "invest",
                label: "Invest Signals",
                desc: "Momentum, breakouts, bounces",
              },
              {
                id: "options",
                label: "Options Signals",
                desc: "Earnings, calls, puts, squeezes",
              },
            ] as const
          ).map((t) => (
            <button
              key={t.id}
              onClick={() => setTab(t.id)}
              className={`flex flex-col items-start px-4 py-2 rounded-lg transition-all text-left ${
                tab === t.id
                  ? t.id === "invest"
                    ? "bg-emerald-600 text-white"
                    : "bg-primary text-primary-foreground"
                  : "text-muted-foreground hover:text-foreground hover:bg-accent/50"
              }`}
            >
              <span className="text-xs font-bold font-mono">{t.label}</span>
              <span
                className={`text-[10px] ${tab === t.id ? "opacity-75" : "text-muted-foreground/50"}`}
              >
                {t.desc}
              </span>
            </button>
          ))}
        </div>

        {/* ── Legend bar ──────────────────────────────── */}
        {!isLoading && signals.length > 0 && (
          <div className="flex items-center gap-4 text-[10px] font-mono text-muted-foreground flex-wrap">
            <span>
              <span className="text-emerald-400 font-bold">↑</span> Bullish
              signal
            </span>
            <span>
              <span className="text-red-400 font-bold">↓</span> Bearish signal
            </span>
            <span>
              <span className="text-muted-foreground">─</span> Neutral / either
              direction
            </span>
            <span className="ml-auto opacity-50">
              Strength 0–100 = how clear and confirmed the signal is
            </span>
          </div>
        )}

        {/* ── Error ───────────────────────────────────── */}
        {error && (
          <div className="rounded-xl border border-red-500/30 bg-red-500/8 px-5 py-4 text-sm text-red-400 font-mono">
            Could not load signals right now. Try refreshing.
          </div>
        )}

        {/* ── Signal grid ─────────────────────────────── */}
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {isLoading ? (
            Array.from({ length: 6 }).map((_, i) => <SignalSkeleton key={i} />)
          ) : signals.length === 0 ? (
            <EmptyState category={tab} />
          ) : (
            signals.map((s) => (
              <SignalCard key={`${s.symbol}-${s.signalType}`} signal={s} />
            ))
          )}
        </div>

        {/* ── Footer disclaimer ───────────────────────── */}
        {!isLoading && (
          <p className="text-[10px] font-mono text-muted-foreground/30 text-center pt-2">
            Signals are generated from live market data · Not financial advice ·
            Always do your own research
          </p>
        )}
      </div>
    </Layout>
  );
}
