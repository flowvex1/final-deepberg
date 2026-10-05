import React, { useState, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { useGetStockHistory, getGetStockHistoryQueryKey } from "@workspace/api-client-react";
import type { GetStockHistoryPeriod } from "@workspace/api-client-react";
import {
  ComposedChart, Area, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, ReferenceLine, ReferenceArea, Label, Customized,
} from "recharts";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import { TrendingUp, TrendingDown, Minus } from "lucide-react";

const BASE = import.meta.env.BASE_URL.replace(/\/$/, "");

const PERIODS: { label: string; value: GetStockHistoryPeriod }[] = [
  { label: "1D", value: "1d"  },
  { label: "5D", value: "5d"  },
  { label: "1M", value: "1mo" },
  { label: "3M", value: "3mo" },
  { label: "6M", value: "6mo" },
  { label: "1Y", value: "1y"  },
  { label: "2Y", value: "2y"  },
  { label: "5Y", value: "5y"  },
];

type HistPoint = {
  date:   string;
  open:   number | null;
  high:   number | null;
  low:    number | null;
  close:  number;
  volume: number | null;
};

/* ══════════════════════════════════════════════════════════════
   EARNINGS
══════════════════════════════════════════════════════════════ */
interface Earning {
  date:            string;
  epsActual:       number | null;
  epsEstimate:     number | null;
  surprisePercent: number | null;
  isFuture:        boolean;
}

function earningColor(e: Earning) {
  if (e.isFuture) return "#818cf8";
  if (e.surprisePercent == null) return "#94a3b8";
  return e.surprisePercent >= 0 ? "#10b981" : "#ef4444";
}

function nearestChartDate(target: string, dates: string[]): string | null {
  if (dates.length === 0) return null;
  const ms = new Date(target).getTime();
  return dates.reduce((best, d) =>
    Math.abs(new Date(d).getTime() - ms) < Math.abs(new Date(best).getTime() - ms) ? d : best
  );
}

/* Custom SVG label that renders an "E" badge on the chart */
const EarningsBadge = (props: { viewBox?: { x: number; y: number; height: number }; earning: Earning }) => {
  const { viewBox, earning } = props;
  if (!viewBox) return <g />;
  const { x, y } = viewBox;
  const col = earningColor(earning);
  return (
    <g>
      <circle cx={x} cy={y + 10} r={7} fill={col} fillOpacity={0.9} />
      <text x={x} y={y + 10} textAnchor="middle" dominantBaseline="middle"
        fill="#0f172a" fontSize={7} fontFamily="monospace" fontWeight="bold">
        E
      </text>
    </g>
  );
};

/* Earnings history row card */
function EarningsRow({ e }: { e: Earning }) {
  const col   = earningColor(e);
  const beat  = (e.surprisePercent ?? 0) >= 0;
  const label = e.isFuture ? "Upcoming" : beat ? "Beat" : "Miss";
  return (
    <div className="flex items-center gap-3 font-mono text-xs border-b border-border/40 py-2">
      <span className="text-muted-foreground w-24 shrink-0">{e.date}</span>
      <span style={{ color: col }} className="w-16 font-semibold">{label}</span>
      <span className="text-muted-foreground">
        EPS&nbsp;
        {e.epsActual != null
          ? <span style={{ color: col }}>${e.epsActual.toFixed(2)}</span>
          : <span className="opacity-40">TBD</span>}
        {e.epsEstimate != null && (
          <span className="opacity-50"> / est ${e.epsEstimate.toFixed(2)}</span>
        )}
      </span>
      {e.surprisePercent != null && (
        <span style={{ color: col }} className="ml-auto font-semibold">
          {e.surprisePercent >= 0 ? "+" : ""}{e.surprisePercent.toFixed(1)}%
        </span>
      )}
    </div>
  );
}

/* ══════════════════════════════════════════════════════════════
   VOLUME PROFILE
══════════════════════════════════════════════════════════════ */
interface VPBucket {
  priceFrom: number;
  priceTo:   number;
  price:     number;
  volume:    number;
  isPOC:     boolean;
  isVA:      boolean;
}

interface VPResult {
  buckets: VPBucket[];
  maxVol:  number;
  poc:     number;
  vah:     number;
  val:     number;
}

function computeVolumeProfile(data: HistPoint[], numBuckets = 28): VPResult {
  const closes  = data.map(d => d.close);
  const volumes = data.map(d => d.volume ?? 0);
  const minP    = Math.min(...closes);
  const maxP    = Math.max(...closes);
  const range   = maxP - minP || 1;
  const bSize   = range / numBuckets;

  const raw = Array.from({ length: numBuckets }, (_, i) => ({
    priceFrom: minP + i * bSize,
    priceTo:   minP + (i + 1) * bSize,
    price:     minP + (i + 0.5) * bSize,
    volume:    0,
  }));

  for (let i = 0; i < data.length; i++) {
    const idx = Math.min(numBuckets - 1, Math.floor((closes[i] - minP) / bSize));
    raw[idx].volume += volumes[i];
  }

  const maxVol   = Math.max(...raw.map(b => b.volume), 1);
  const totalVol = raw.reduce((s, b) => s + b.volume, 0);
  const pocIdx   = raw.reduce((best, b, i) => (b.volume > raw[best].volume ? i : best), 0);

  const sorted  = [...raw.map((b, i) => ({ ...b, i }))].sort((a, b) => b.volume - a.volume);
  let vaAcc     = 0;
  const vaSet   = new Set<number>();
  for (const b of sorted) {
    vaAcc += b.volume;
    vaSet.add(b.i);
    if (vaAcc >= totalVol * 0.7) break;
  }

  const vaIdxs  = [...vaSet].sort((a, b) => a - b);
  const vahIdx  = Math.max(...vaIdxs);
  const valIdx  = Math.min(...vaIdxs);

  return {
    buckets: raw.map((b, i) => ({ ...b, isPOC: i === pocIdx, isVA: vaSet.has(i) })),
    maxVol,
    poc: raw[pocIdx].price,
    vah: raw[vahIdx]?.priceTo   ?? maxP,
    val: raw[valIdx]?.priceFrom ?? minP,
  };
}

function makeVPRenderer(vp: VPResult, showVP: boolean) {
  const MAX_BAR_W = 88;
  return function VPRenderer(props: Record<string, unknown>) {
    if (!showVP) return null;
    const yAxisMap = props.yAxisMap as Record<string, { scale: (v: number) => number }> | undefined;
    const width    = props.width    as number | undefined;
    const margin   = props.margin   as { top: number; right: number; bottom: number; left: number } | undefined;
    if (!yAxisMap || !width || !margin) return null;
    const yAxis = yAxisMap[0];
    if (!yAxis?.scale) return null;
    const plotRight = width - (margin.right ?? 10);

    return (
      <g>
        {(() => {
          const yVAH = yAxis.scale(vp.vah);
          const yVAL = yAxis.scale(vp.val);
          return (
            <rect x={plotRight - MAX_BAR_W - 2} y={Math.min(yVAH, yVAL)}
              width={MAX_BAR_W + 2} height={Math.abs(yVAL - yVAH)}
              fill="#6366f1" fillOpacity={0.04} />
          );
        })()}
        {vp.buckets.map((b, i) => {
          const yTop = yAxis.scale(b.priceTo);
          const yBot = yAxis.scale(b.priceFrom);
          const h    = Math.max(1.5, Math.abs(yBot - yTop));
          const w    = Math.max(2, (b.volume / vp.maxVol) * MAX_BAR_W);
          const x    = plotRight - w;
          const y    = Math.min(yTop, yBot);
          const opacity = b.isPOC ? 0.88 : b.isVA ? 0.12 + 0.55 * (b.volume / vp.maxVol) : 0.06 + 0.30 * (b.volume / vp.maxVol);
          const fill    = b.isPOC ? "#f59e0b" : b.isVA ? "#10b981" : "#64748b";
          return <rect key={i} x={x} y={y} width={w} height={h} fill={fill} fillOpacity={opacity} />;
        })}
        {(() => {
          const poc = vp.buckets.find(b => b.isPOC);
          if (!poc) return null;
          const yPoc = yAxis.scale(poc.price);
          return (
            <g>
              <line x1={plotRight - MAX_BAR_W - 2} x2={plotRight} y1={yPoc} y2={yPoc}
                stroke="#f59e0b" strokeWidth={1.5} strokeDasharray="5 2" strokeOpacity={0.8} />
              <text x={plotRight - MAX_BAR_W - 6} y={yPoc} textAnchor="end" dominantBaseline="middle"
                fill="#f59e0b" fontSize={8} fontFamily="monospace" opacity={0.9}>POC</text>
            </g>
          );
        })()}
        {(() => {
          const yVAH = yAxis.scale(vp.vah);
          const yVAL = yAxis.scale(vp.val);
          return (
            <g>
              <text x={plotRight - MAX_BAR_W - 6} y={yVAH} textAnchor="end" dominantBaseline="middle"
                fill="#6366f1" fontSize={7} fontFamily="monospace" opacity={0.7}>VAH</text>
              <text x={plotRight - MAX_BAR_W - 6} y={yVAL} textAnchor="end" dominantBaseline="middle"
                fill="#6366f1" fontSize={7} fontFamily="monospace" opacity={0.7}>VAL</text>
            </g>
          );
        })()}
      </g>
    );
  };
}

/* ══════════════════════════════════════════════════════════════
   BREAK OF STRUCTURE
══════════════════════════════════════════════════════════════ */
interface StructureLevel {
  price:     number;
  kind:      "bos_bull" | "bos_bear" | "support" | "resistance";
  breakDate: string;
}

interface Prediction {
  direction: "up" | "down" | "flat";
  target:    number;
  rangeLow:  number;
  rangeHigh: number;
  pctMove:   number;
  zoneX1:    string;
  zoneX2:    string;
}

function lookbackFor(period: GetStockHistoryPeriod): number {
  return ({ "1d": 8, "5d": 5, "1mo": 4, "3mo": 5, "6mo": 6, "1y": 7, "2y": 9, "5y": 12 } as Record<string, number>)[period] ?? 5;
}

function analyzeStructure(data: HistPoint[], period: GetStockHistoryPeriod): {
  levels: StructureLevel[]; prediction: Prediction | null;
} {
  if (data.length < 20) return { levels: [], prediction: null };
  const lb = lookbackFor(period);

  interface Swing { i: number; price: number; type: "high" | "low" }
  const swings: Swing[] = [];
  for (let i = lb; i < data.length - lb; i++) {
    const ph = data[i].high  ?? data[i].close;
    const pl = data[i].low   ?? data[i].close;
    let isHigh = true, isLow = true;
    for (let j = i - lb; j <= i + lb; j++) {
      if (j === i) continue;
      if ((data[j].high ?? data[j].close) >= ph) isHigh = false;
      if ((data[j].low  ?? data[j].close) <= pl) isLow  = false;
    }
    if (isHigh) swings.push({ i, price: ph, type: "high" });
    if (isLow)  swings.push({ i, price: pl, type: "low"  });
  }

  const levels: StructureLevel[] = [];
  const usedH = new Set<number>(), usedL = new Set<number>();
  for (const sw of swings) {
    if (sw.type === "high") {
      for (let k = sw.i + 1; k < data.length; k++) {
        if (data[k].close > sw.price && !usedH.has(sw.i)) {
          usedH.add(sw.i);
          levels.push({ price: sw.price, kind: "bos_bull", breakDate: data[k].date });
          break;
        }
      }
    } else {
      for (let k = sw.i + 1; k < data.length; k++) {
        if (data[k].close < sw.price && !usedL.has(sw.i)) {
          usedL.add(sw.i);
          levels.push({ price: sw.price, kind: "bos_bear", breakDate: data[k].date });
          break;
        }
      }
    }
  }

  const recentBOS    = levels.sort((a, b) => a.breakDate > b.breakDate ? -1 : 1).slice(0, 3).reverse();
  const brokenPrices = new Set(levels.map(l => l.price));
  const unbrokenH    = swings.filter(s => s.type === "high" && !brokenPrices.has(s.price));
  const unbrokenL    = swings.filter(s => s.type === "low"  && !brokenPrices.has(s.price));
  const lastH        = unbrokenH.at(-1);
  const lastL        = unbrokenL.at(-1);
  if (lastH && lastH.i >= data.length - lb * 4)
    recentBOS.push({ price: lastH.price, kind: "resistance", breakDate: data[lastH.i].date });
  if (lastL && lastL.i >= data.length - lb * 4)
    recentBOS.push({ price: lastL.price, kind: "support",    breakDate: data[lastL.i].date });

  const LB2    = Math.min(30, Math.floor(data.length * 0.4));
  const recent = data.slice(-LB2);
  const n      = recent.length;
  const xs     = recent.map((_, i) => i);
  const ys     = recent.map(p => p.close);
  const mX     = xs.reduce((a, b) => a + b, 0) / n;
  const mY     = ys.reduce((a, b) => a + b, 0) / n;
  const slope  = xs.reduce((a, x, i) => a + (x - mX) * (ys[i] - mY), 0) /
                 xs.reduce((a, x) => a + (x - mX) ** 2, 0);
  const ic     = mY - slope * mX;
  const resid  = ys.map((y, i) => y - (ic + slope * xs[i]));
  const sd     = Math.sqrt(resid.reduce((a, r) => a + r * r, 0) / n);
  const steps  = Math.round(n * 0.15);
  const target = ic + slope * (n - 1 + steps);
  const cur    = data.at(-1)!.close;

  return {
    levels: recentBOS,
    prediction: {
      direction: slope > 0.05 ? "up" : slope < -0.05 ? "down" : "flat",
      target:    parseFloat(target.toFixed(2)),
      rangeLow:  parseFloat((target - sd * 1.6).toFixed(2)),
      rangeHigh: parseFloat((target + sd * 1.6).toFixed(2)),
      pctMove:   parseFloat(((target - cur) / cur * 100).toFixed(2)),
      zoneX1:    data[Math.floor(data.length * 0.82)]?.date ?? data.at(-1)!.date,
      zoneX2:    data.at(-1)!.date,
    },
  };
}

const BULL = "#10b981", BEAR = "#ef4444", RESIST = "#f59e0b", SUPP = "#6366f1";
function kindColor(k: StructureLevel["kind"]) {
  return k === "bos_bull" ? BULL : k === "bos_bear" ? BEAR : k === "resistance" ? RESIST : SUPP;
}
function kindDash(k: StructureLevel["kind"]) {
  return (k === "support" || k === "resistance") ? "6 3" : "5 4";
}
function kindLabel(k: StructureLevel["kind"], p: number) {
  const px = `$${p.toFixed(2)}`;
  return k === "bos_bull" ? `↑ BOS ${px}` : k === "bos_bear" ? `↓ BOS ${px}` :
         k === "resistance" ? `⊢ Res ${px}` : `⊢ Sup ${px}`;
}

/* ══════════════════════════════════════════════════════════════
   INFO BAR
══════════════════════════════════════════════════════════════ */
function StructureBar({ levels, pred, vp, showVP, nextEarning }: {
  levels: StructureLevel[]; pred: Prediction | null; vp: VPResult | null; showVP: boolean; nextEarning: Earning | null;
}) {
  const bullBOS   = levels.filter(l => l.kind === "bos_bull").length;
  const bearBOS   = levels.filter(l => l.kind === "bos_bear").length;
  const sentiment = bullBOS > bearBOS ? "bullish" : bearBOS > bullBOS ? "bearish" : "mixed";

  return (
    <div className="flex items-center gap-2 flex-wrap text-[11px] font-mono px-1">
      <div className={`flex items-center gap-1 rounded px-2 py-0.5 border
        ${sentiment === "bullish" ? "border-emerald-500/30 text-emerald-400 bg-emerald-500/8" :
          sentiment === "bearish" ? "border-red-500/30 text-red-400 bg-red-500/8" :
          "border-border text-muted-foreground"}`}>
        {sentiment === "bullish" ? <TrendingUp className="h-3 w-3" /> :
         sentiment === "bearish" ? <TrendingDown className="h-3 w-3" /> : <Minus className="h-3 w-3" />}
        {bullBOS}↑ {bearBOS}↓ BOS
      </div>

      {pred && (
        <div className={`flex items-center gap-1 rounded px-2 py-0.5 border
          ${pred.direction === "up" ? "border-emerald-500/30 text-emerald-400 bg-emerald-500/8" :
            pred.direction === "down" ? "border-red-500/30 text-red-400 bg-red-500/8" :
            "border-border text-muted-foreground"}`}>
          {pred.direction === "up" ? <TrendingUp className="h-3 w-3" /> :
           pred.direction === "down" ? <TrendingDown className="h-3 w-3" /> : <Minus className="h-3 w-3" />}
          Projected ${pred.target.toFixed(2)}
          <span className="opacity-60 ml-0.5">({pred.pctMove >= 0 ? "+" : ""}{pred.pctMove.toFixed(1)}%)</span>
        </div>
      )}

      {showVP && vp && (
        <>
          <div className="flex items-center gap-1 rounded px-2 py-0.5 border border-amber-500/30 text-amber-400 bg-amber-500/8">
            POC ${vp.poc.toFixed(2)}
          </div>
          <div className="flex items-center gap-1 rounded px-2 py-0.5 border border-indigo-500/30 text-indigo-400 bg-indigo-500/8">
            VA ${vp.val.toFixed(2)}–${vp.vah.toFixed(2)}
          </div>
        </>
      )}

      {nextEarning && (
        <div className="flex items-center gap-1 rounded px-2 py-0.5 border border-violet-500/30 text-violet-400 bg-violet-500/8">
          <span className="text-[9px] font-bold mr-0.5 bg-violet-500/20 rounded px-1">E</span>
          Next earnings {nextEarning.date}
        </div>
      )}

      <span className="text-muted-foreground/35 ml-auto">Linear regression · Not financial advice</span>
    </div>
  );
}

/* ══════════════════════════════════════════════════════════════
   MAIN COMPONENT
══════════════════════════════════════════════════════════════ */
export function StockChart({ symbol, isPositive = true }: { symbol: string; isPositive?: boolean }) {
  const [period,        setPeriod]        = useState<GetStockHistoryPeriod>("3mo");
  const [showStructure, setShowStructure] = useState(true);
  const [showVP,        setShowVP]        = useState(true);
  const [showEarnings,  setShowEarnings]  = useState(true);

  const { data: history, isLoading } = useGetStockHistory(
    symbol,
    { period },
    { query: { enabled: !!symbol, queryKey: getGetStockHistoryQueryKey(symbol, { period }) } }
  );

  const { data: earnings } = useQuery<Earning[]>({
    queryKey: ["earnings", symbol],
    queryFn:  async () => {
      const res = await fetch(`${BASE}/api/stocks/${symbol}/earnings`);
      if (!res.ok) return [];
      return res.json();
    },
    enabled:  !!symbol,
    staleTime: 60 * 60 * 1000,
  });

  const priceColor = isPositive ? "hsl(var(--chart-2))" : "hsl(var(--destructive))";

  const { levels, prediction } = useMemo(
    () => history ? analyzeStructure(history as HistPoint[], period) : { levels: [], prediction: null },
    [history, period]
  );

  const vp = useMemo(
    () => (history && history.length > 5 ? computeVolumeProfile(history as HistPoint[]) : null),
    [history]
  );

  const vpRenderer = useMemo(
    () => vp ? makeVPRenderer(vp, showVP) : () => null,
    [vp, showVP]
  );

  /* Filter earnings events visible in the current chart time window */
  const chartDates = useMemo(() => (history ?? []).map((h) => (h as HistPoint).date), [history]);
  const chartStart = chartDates[0] ?? "";
  const chartEnd   = chartDates[chartDates.length - 1] ?? "";

  const visibleEarnings = useMemo((): (Earning & { chartDate: string })[] => {
    if (!earnings || chartDates.length === 0) return [];
    return earnings
      .filter(e => e.date >= chartStart && e.date <= chartEnd)
      .map(e => ({ ...e, chartDate: nearestChartDate(e.date, chartDates) ?? e.date }));
  }, [earnings, chartDates, chartStart, chartEnd]);

  const nextEarning = useMemo(() => {
    if (!earnings) return null;
    const today = new Date().toISOString().slice(0, 10);
    return earnings.find(e => e.isFuture && e.date >= today) ?? null;
  }, [earnings]);

  const yDomain = useMemo((): [number, number] | ["auto", "auto"] => {
    if (!history || history.length === 0) return ["auto", "auto"];
    const all = (history as HistPoint[]).map(h => h.close);
    if (showStructure) {
      all.push(...levels.map(l => l.price));
      if (prediction) all.push(prediction.rangeLow, prediction.rangeHigh, prediction.target);
    }
    if (showVP && vp) all.push(vp.vah, vp.val, vp.poc);
    const mn  = Math.min(...all);
    const mx  = Math.max(...all);
    const pad = (mx - mn) * 0.06;
    return [mn - pad, mx + pad];
  }, [history, levels, prediction, showStructure, vp, showVP]);

  return (
    <div className="flex flex-col gap-3">
      {/* ── Controls ──────────────────────────────────────── */}
      <div className="flex items-center gap-2 flex-wrap">
        <div className="flex flex-wrap gap-1">
          {PERIODS.map((p) => (
            <Button key={p.value} variant={period === p.value ? "default" : "outline"}
              size="sm" onClick={() => setPeriod(p.value)}
              className="font-mono text-xs h-7 px-3">
              {p.label}
            </Button>
          ))}
        </div>

        <div className="ml-auto flex gap-1.5">
          <button onClick={() => setShowEarnings(v => !v)}
            className={`text-xs font-mono px-3 py-1.5 rounded-md border transition-colors
              ${showEarnings
                ? "border-violet-500/40 bg-violet-500/10 text-violet-400"
                : "border-border text-muted-foreground hover:text-foreground"}`}>
            {showEarnings ? "Earnings ON" : "Earnings OFF"}
          </button>
          <button onClick={() => setShowVP(v => !v)}
            className={`text-xs font-mono px-3 py-1.5 rounded-md border transition-colors
              ${showVP
                ? "border-amber-500/40 bg-amber-500/10 text-amber-400"
                : "border-border text-muted-foreground hover:text-foreground"}`}>
            {showVP ? "Vol Profile ON" : "Vol Profile OFF"}
          </button>
          <button onClick={() => setShowStructure(v => !v)}
            className={`text-xs font-mono px-3 py-1.5 rounded-md border transition-colors
              ${showStructure
                ? "border-primary/40 bg-primary/10 text-primary"
                : "border-border text-muted-foreground hover:text-foreground"}`}>
            {showStructure ? "Structure ON" : "Structure OFF"}
          </button>
        </div>
      </div>

      {/* ── Info bar ──────────────────────────────────────── */}
      {!isLoading && (
        <StructureBar levels={levels} pred={prediction} vp={vp} showVP={showVP} nextEarning={nextEarning} />
      )}

      {/* ── Chart ─────────────────────────────────────────── */}
      <div className="h-[400px] w-full bg-card rounded-md border border-border p-4">
        {isLoading ? (
          <Skeleton className="w-full h-full rounded-sm" />
        ) : history && history.length > 0 ? (
          <ResponsiveContainer width="100%" height="100%">
            <ComposedChart data={history as HistPoint[]} margin={{ top: 10, right: 100, left: 0, bottom: 0 }}>
              <defs>
                <linearGradient id="colorPrice" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%"  stopColor={priceColor} stopOpacity={0.3} />
                  <stop offset="95%" stopColor={priceColor} stopOpacity={0.01} />
                </linearGradient>
                <linearGradient id="predGradU" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%"   stopColor={BULL} stopOpacity={0.15} />
                  <stop offset="100%" stopColor={BULL} stopOpacity={0.04} />
                </linearGradient>
                <linearGradient id="predGradD" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%"   stopColor={BEAR} stopOpacity={0.04} />
                  <stop offset="100%" stopColor={BEAR} stopOpacity={0.15} />
                </linearGradient>
              </defs>

              <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="hsl(var(--border))" />

              <XAxis dataKey="date"
                tickFormatter={(d) => {
                  const dt = new Date(d);
                  if (period === "1d" || period === "5d")
                    return `${dt.getHours()}:${dt.getMinutes().toString().padStart(2, "0")}`;
                  return `${dt.getMonth() + 1}/${dt.getDate()}`;
                }}
                stroke="hsl(var(--muted-foreground))" fontSize={11} tickLine={false} axisLine={false} />

              <YAxis domain={yDomain}
                stroke="hsl(var(--muted-foreground))" fontSize={11}
                tickLine={false} axisLine={false}
                tickFormatter={(v) => `$${v.toFixed(0)}`} width={56} />

              <Tooltip
                contentStyle={{
                  backgroundColor: "hsl(var(--card))",
                  borderColor:     "hsl(var(--border))",
                  borderRadius:    "var(--radius)",
                  color:           "hsl(var(--foreground))",
                  fontSize:        "12px", fontFamily: "monospace",
                }}
                itemStyle={{ color: "hsl(var(--foreground))" }}
                labelStyle={{ color: "hsl(var(--muted-foreground))", marginBottom: "4px" }}
                formatter={(value: number) => [`$${value.toFixed(2)}`, "Price"]}
                labelFormatter={(l) => new Date(l).toLocaleDateString()}
              />

              {/* ── Volume profile overlay ─────────────── */}
              <Customized component={vpRenderer as any} />

              {/* ── POC line ──────────────────────────── */}
              {showVP && vp && (
                <ReferenceLine y={vp.poc} stroke="#f59e0b" strokeDasharray="7 3" strokeWidth={1} strokeOpacity={0.5}>
                  <Label value={`POC $${vp.poc.toFixed(2)}`} position="insideTopLeft"
                    style={{ fontSize: 8, fontFamily: "monospace", fill: "#f59e0b", fillOpacity: 0.8 }} offset={3} />
                </ReferenceLine>
              )}

              {/* ── VA lines ──────────────────────────── */}
              {showVP && vp && (
                <>
                  <ReferenceLine y={vp.vah} stroke="#6366f1" strokeDasharray="4 4" strokeWidth={1} strokeOpacity={0.4} />
                  <ReferenceLine y={vp.val} stroke="#6366f1" strokeDasharray="4 4" strokeWidth={1} strokeOpacity={0.4} />
                </>
              )}

              {/* ── Prediction cone ───────────────────── */}
              {showStructure && prediction && (
                <ReferenceArea
                  x1={prediction.zoneX1} x2={prediction.zoneX2}
                  y1={prediction.rangeLow} y2={prediction.rangeHigh}
                  fill={prediction.direction === "up" ? "url(#predGradU)" : prediction.direction === "down" ? "url(#predGradD)" : "hsla(220,15%,50%,0.08)"}
                  stroke={prediction.direction === "up" ? BULL : prediction.direction === "down" ? BEAR : "#aaa"}
                  strokeOpacity={0.2} strokeDasharray="3 3"
                />
              )}

              {/* ── Prediction target line ────────────── */}
              {showStructure && prediction && (
                <ReferenceLine y={prediction.target}
                  stroke={prediction.direction === "up" ? BULL : prediction.direction === "down" ? BEAR : "#aaa"}
                  strokeWidth={1} strokeDasharray="8 4" strokeOpacity={0.6}>
                  <Label
                    value={`→ ${prediction.pctMove >= 0 ? "+" : ""}${prediction.pctMove.toFixed(1)}% · $${prediction.target.toFixed(2)}`}
                    position="insideTopRight"
                    style={{ fontSize: 9, fontFamily: "monospace",
                      fill: prediction.direction === "up" ? BULL : prediction.direction === "down" ? BEAR : "#aaa",
                      fillOpacity: 0.9 }} offset={4} />
                </ReferenceLine>
              )}

              {/* ── BOS & structure levels ────────────── */}
              {showStructure && levels.map((lvl, i) => (
                <ReferenceLine key={i} y={lvl.price}
                  stroke={kindColor(lvl.kind)} strokeWidth={1.5}
                  strokeDasharray={kindDash(lvl.kind)} strokeOpacity={0.75}>
                  <Label value={kindLabel(lvl.kind, lvl.price)}
                    position={i % 2 === 0 ? "insideTopLeft" : "insideBottomLeft"}
                    style={{ fontSize: 9, fontFamily: "monospace", fill: kindColor(lvl.kind), fillOpacity: 0.9 }} offset={4} />
                </ReferenceLine>
              ))}

              {/* ── Earnings vertical markers ─────────── */}
              {showEarnings && visibleEarnings.map((e, i) => {
                const col = earningColor(e);
                return (
                  <ReferenceLine key={`e-${i}`} x={e.chartDate}
                    stroke={col} strokeWidth={1.5} strokeDasharray="4 3" strokeOpacity={0.75}
                    label={(props: { viewBox?: { x: number; y: number; height: number } }) =>
                      <EarningsBadge {...props} earning={e} />
                    }
                  />
                );
              })}

              {/* ── Upcoming earnings marker ──────────── */}
              {showEarnings && nextEarning && (() => {
                const nearestFuture = chartDates.length > 0 ? chartDates[chartDates.length - 1] : null;
                if (!nearestFuture) return null;
                return (
                  <ReferenceLine x={nearestFuture}
                    stroke="#818cf8" strokeWidth={2} strokeDasharray="3 3" strokeOpacity={0.5}
                    label={({ viewBox }: { viewBox?: { x: number; y: number; height: number } }) => {
                      if (!viewBox) return <g />;
                      const { x, y } = viewBox;
                      return (
                        <g>
                          <rect x={x + 4} y={y + 2} width={60} height={14} rx={3}
                            fill="#818cf8" fillOpacity={0.15} stroke="#818cf8" strokeOpacity={0.4} strokeWidth={0.5} />
                          <text x={x + 34} y={y + 9} textAnchor="middle" dominantBaseline="middle"
                            fill="#818cf8" fontSize={7} fontFamily="monospace">
                            E {nextEarning.date}
                          </text>
                        </g>
                      );
                    }}
                  />
                );
              })()}

              {/* ── Price area ────────────────────────── */}
              <Area type="monotone" dataKey="close"
                stroke={priceColor} strokeWidth={2}
                fillOpacity={1} fill="url(#colorPrice)"
                dot={false} activeDot={{ r: 4, strokeWidth: 0 }}
              />
            </ComposedChart>
          </ResponsiveContainer>
        ) : (
          <div className="w-full h-full flex items-center justify-center text-muted-foreground text-sm">
            No chart data available for this period.
          </div>
        )}
      </div>

      {/* ── Legend ────────────────────────────────────────── */}
      {!isLoading && (showStructure || showVP || showEarnings) && (
        <div className="flex items-center gap-4 text-[10px] font-mono text-muted-foreground flex-wrap px-1">
          {showEarnings && (
            <>
              <span><span className="text-emerald-400 font-bold">● E</span> beat</span>
              <span><span className="text-red-400 font-bold">● E</span> miss</span>
              <span><span className="text-violet-400 font-bold">● E</span> upcoming</span>
            </>
          )}
          {showStructure && (
            <>
              <span><span className="text-emerald-400 font-bold">↑ BOS</span> bullish break</span>
              <span><span className="text-red-400 font-bold">↓ BOS</span> bearish break</span>
              <span><span className="text-amber-400 font-bold">⊢ Res</span> resistance</span>
              <span><span className="text-indigo-400 font-bold">⊢ Sup</span> support</span>
            </>
          )}
          {showVP && (
            <>
              <span><span className="text-amber-400 font-bold">━</span> POC</span>
              <span><span className="text-indigo-400 font-bold">━</span> Value Area (70%)</span>
            </>
          )}
        </div>
      )}

      {/* ── Earnings history panel ────────────────────────── */}
      {showEarnings && earnings && earnings.length > 0 && (
        <div className="bg-card border border-border rounded-md p-4 mt-1">
          <div className="flex items-center gap-2 mb-3">
            <span className="text-[10px] font-mono font-semibold text-muted-foreground uppercase tracking-widest">
              Earnings History
            </span>
            <span className="ml-auto text-[10px] font-mono text-muted-foreground opacity-50">
              {earnings.length} events
            </span>
          </div>
          <div className="flex flex-col">
            {[...earnings].reverse().map((e, i) => (
              <EarningsRow key={i} e={e} />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
