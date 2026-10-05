import { useState, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { Layout } from "@/components/layout";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Grid3x3, Search, TrendingUp, TrendingDown,
  Crosshair, AlertTriangle, Activity, Zap,
} from "lucide-react";
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, ReferenceLine, Cell,
} from "recharts";

const BASE = import.meta.env.BASE_URL.replace(/\/$/, "");

/* ── Types ─────────────────────────────────────────────────── */
interface CellData {
  callVolume:  number;
  putVolume:   number;
  callOI:      number;
  putOI:       number;
  callIV:      number | null;
  putIV:       number | null;
  imbalance:   number;
  totalVolume: number;
}

interface HeatmapData {
  symbol:        string;
  currentPrice:  number;
  expirations:   string[];
  strikes:       number[];
  maxVolume:     number;
  cells:         Record<string, CellData>;
  totalCalls:    number;
  totalPuts:     number;
  putCallRatio:  number | null;
  bullishStrike: number | null;
  bearishStrike: number | null;
  maxPainStrike: number;
  updatedAt:     string;
}

/* ── Helpers ─────────────────────────────────────────────────── */
function daysToExp(exp: string): number {
  return Math.max(0, Math.round((new Date(exp).getTime() - Date.now()) / 86_400_000));
}
function fmtExp(exp: string): string {
  return new Date(exp).toLocaleDateString("en-US", { month: "short", day: "numeric" });
}
function fmtK(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000)     return `${(n / 1_000).toFixed(0)}K`;
  return String(n);
}

function cellBg(cell: CellData | undefined, maxVol: number): React.CSSProperties {
  if (!cell || cell.totalVolume === 0) return {};
  const intensity = Math.pow(cell.totalVolume / maxVol, 0.4);
  const imb = cell.imbalance;
  if (imb > 0.15) {
    const l = Math.round(55 - imb * 22);
    return { backgroundColor: `hsla(152, 72%, ${l}%, ${(intensity * 0.88).toFixed(2)})` };
  }
  if (imb < -0.15) {
    const l = Math.round(55 - Math.abs(imb) * 22);
    return { backgroundColor: `hsla(0, 72%, ${l}%, ${(intensity * 0.88).toFixed(2)})` };
  }
  return { backgroundColor: `hsla(220, 15%, 45%, ${(intensity * 0.35).toFixed(2)})` };
}

function cellTextCls(cell: CellData | undefined): string {
  if (!cell || cell.totalVolume === 0) return "text-muted-foreground/15";
  if (Math.abs(cell.imbalance) > 0.3) return "text-white font-bold";
  return "text-foreground/70";
}

/* ── Detail panel shown on hover/click ──────────────────────── */
function DetailPanel({ cell, strike, exp, currentPrice }: {
  cell: CellData; strike: number; exp: string; currentPrice: number;
}) {
  const dte   = daysToExp(exp);
  const otm   = ((strike - currentPrice) / currentPrice * 100).toFixed(1);
  const above = strike > currentPrice;
  const lbl   = cell.imbalance > 0.1 ? "Call heavy" : cell.imbalance < -0.1 ? "Put heavy" : "Balanced";
  const skew  = Math.abs(Math.round(cell.imbalance * 100));

  return (
    <div className="rounded-xl border border-border bg-card shadow-2xl p-4 space-y-3 text-xs font-mono">
      <div className="flex items-center justify-between">
        <span className="font-bold text-sm">${strike} strike</span>
        <span className="text-muted-foreground">{fmtExp(exp)} · {dte}d</span>
      </div>
      <p className="text-muted-foreground/70">
        {Number(otm) >= 0 ? "+" : ""}{otm}% &nbsp;
        {above ? "OTM call / ITM put" : "ITM call / OTM put"}
      </p>
      <div className="grid grid-cols-2 gap-3 border-t border-border/40 pt-3">
        <div className="space-y-1">
          <p className="text-emerald-400 font-bold text-[10px] uppercase tracking-wider">Calls</p>
          <p>Vol: <span className="text-emerald-400 font-bold">{fmtK(cell.callVolume)}</span></p>
          <p>OI: {fmtK(cell.callOI)}</p>
          {cell.callIV != null && <p>IV: {(cell.callIV * 100).toFixed(0)}%</p>}
        </div>
        <div className="space-y-1">
          <p className="text-red-400 font-bold text-[10px] uppercase tracking-wider">Puts</p>
          <p>Vol: <span className="text-red-400 font-bold">{fmtK(cell.putVolume)}</span></p>
          <p>OI: {fmtK(cell.putOI)}</p>
          {cell.putIV != null && <p>IV: {(cell.putIV * 100).toFixed(0)}%</p>}
        </div>
      </div>
      <div className={`flex items-center justify-between rounded-lg px-2.5 py-2 border
        ${cell.imbalance > 0.1
          ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-400"
          : cell.imbalance < -0.1
            ? "border-red-500/30 bg-red-500/10 text-red-400"
            : "border-border text-muted-foreground"}`}>
        <span>{lbl}</span>
        <span className="font-bold">{skew}% skew</span>
      </div>
    </div>
  );
}

/* ── Per-expiration P/C mini bar ─────────────────────────────── */
function PcBar({ calls, puts }: { calls: number; puts: number }) {
  const total = calls + puts;
  if (total === 0) return <div className="h-1 rounded-full bg-border/20 mt-1 w-full" />;
  const cp = (calls / total) * 100;
  return (
    <div className="flex h-1 rounded-full overflow-hidden mt-1 w-full">
      <div className="bg-emerald-500/70" style={{ width: `${cp}%` }} />
      <div className="bg-red-500/70"     style={{ width: `${100 - cp}%` }} />
    </div>
  );
}

/* ── Grid ────────────────────────────────────────────────────── */
function HeatGrid({ data }: { data: HeatmapData }) {
  const [hovered, setHovered] = useState<{ strike: number; exp: string } | null>(null);
  const [pinned,  setPinned]  = useState<{ strike: number; exp: string } | null>(null);

  const active     = pinned ?? hovered;
  const activeCell = active ? data.cells[`${active.strike}-${active.exp}`] : null;

  const expTotals = data.expirations.map(exp => {
    let calls = 0, puts = 0;
    for (const s of data.strikes) {
      const c = data.cells[`${s}-${exp}`];
      if (c) { calls += c.callVolume; puts += c.putVolume; }
    }
    return { calls, puts };
  });

  const atmStrike = data.strikes.reduce((best, s) =>
    Math.abs(s - data.currentPrice) < Math.abs(best - data.currentPrice) ? s : best,
    data.strikes[0] ?? data.currentPrice
  );

  return (
    <div className="flex gap-4 items-start">
      {/* ── Table ─────────────────────────────────────────── */}
      <div className="flex-1 min-w-0 overflow-x-auto">
        <table className="border-separate border-spacing-[3px] w-full min-w-max">
          <thead>
            <tr>
              <th className="w-20 sticky left-0 bg-background z-10 pb-2">
                <span className="text-[9px] font-mono uppercase tracking-wider text-muted-foreground/40">Strike</span>
              </th>
              {data.expirations.map((exp, i) => (
                <th key={exp} className="text-center pb-2 px-0.5 min-w-[84px]">
                  <p className="text-[10px] font-mono font-bold text-foreground/80">{fmtExp(exp)}</p>
                  <p className="text-[9px] font-mono text-muted-foreground/50">{daysToExp(exp)}d</p>
                  <PcBar calls={expTotals[i].calls} puts={expTotals[i].puts} />
                </th>
              ))}
            </tr>
          </thead>

          <tbody>
            {data.strikes.map(strike => {
              const isAtm  = strike === atmStrike;
              const isMxPn = strike === data.maxPainStrike;
              const isBull = strike === data.bullishStrike;
              const isBear = strike === data.bearishStrike;
              const above  = strike > data.currentPrice;

              return (
                <tr key={strike}>
                  {/* Strike label */}
                  <td className="sticky left-0 bg-background z-10 py-0 pr-1">
                    <div className={`flex items-center justify-end gap-1 rounded-l px-1.5 py-1
                      ${isAtm ? "bg-primary/12 border-l border-y border-primary/25" : "bg-muted/10"}`}>
                      {isMxPn && <span className="text-[8px] text-blue-400 font-bold leading-none">MP</span>}
                      {isBull && !isAtm && <TrendingUp  className="h-2.5 w-2.5 text-emerald-400 shrink-0" />}
                      {isBear && !isAtm && <TrendingDown className="h-2.5 w-2.5 text-red-400 shrink-0" />}
                      <span className={`text-xs font-mono font-bold tabular-nums leading-none
                        ${isAtm ? "text-primary" : above ? "text-emerald-400/60" : "text-red-400/60"}`}>
                        ${strike}
                      </span>
                    </div>
                  </td>

                  {/* Data cells */}
                  {data.expirations.map(exp => {
                    const key    = `${strike}-${exp}`;
                    const cell   = data.cells[key];
                    const isHov  = hovered?.strike === strike && hovered?.exp === exp;
                    const isPin  = pinned?.strike  === strike && pinned?.exp  === exp;
                    const style  = cellBg(cell, data.maxVolume);

                    return (
                      <td
                        key={exp}
                        style={style}
                        className={`cursor-pointer transition-all rounded
                          ${isHov || isPin ? "ring-2 ring-white/50 ring-inset z-10 relative" : ""}
                          ${isAtm ? "border-y border-primary/10" : ""}`}
                        onMouseEnter={() => setHovered({ strike, exp })}
                        onMouseLeave={() => setHovered(null)}
                        onClick={() => setPinned(p =>
                          p?.strike === strike && p?.exp === exp ? null : { strike, exp }
                        )}
                      >
                        <div className="flex flex-col items-center justify-center px-1 py-1.5 min-h-[34px]">
                          {cell && cell.totalVolume > 0 ? (
                            <>
                              <span className={`text-[10px] font-mono tabular-nums ${cellTextCls(cell)}`}>
                                {fmtK(cell.totalVolume)}
                              </span>
                              {/* tiny imbalance bar */}
                              <div className="flex items-center gap-px mt-0.5 h-0.5">
                                <div className="h-full rounded-full bg-emerald-400/80"
                                  style={{ width: `${Math.round(Math.max(0, cell.imbalance) * 18)}px` }} />
                                <div className="h-full rounded-full bg-red-400/80"
                                  style={{ width: `${Math.round(Math.max(0, -cell.imbalance) * 18)}px` }} />
                              </div>
                            </>
                          ) : (
                            <span className="text-[9px] text-muted-foreground/12">—</span>
                          )}
                        </div>
                      </td>
                    );
                  })}
                </tr>
              );
            })}
          </tbody>
        </table>

        <p className="text-[9px] font-mono text-muted-foreground/35 mt-2 px-1">
          ATM ≈ ${data.currentPrice.toFixed(2)} &nbsp;·&nbsp;
          Green = call-heavy &nbsp;·&nbsp; Red = put-heavy &nbsp;·&nbsp; Brightness = volume intensity &nbsp;·&nbsp;
          Click any cell to pin detail
        </p>
      </div>

      {/* ── Detail panel ─────────────────────────────────── */}
      <div className="w-56 shrink-0 self-start sticky top-4">
        {activeCell ? (
          <DetailPanel
            cell={activeCell}
            strike={active!.strike}
            exp={active!.exp}
            currentPrice={data.currentPrice}
          />
        ) : (
          <div className="rounded-xl border border-border/30 bg-muted/8 p-5 flex flex-col items-center gap-2 text-center">
            <Crosshair className="h-6 w-6 text-muted-foreground/20" />
            <p className="text-[10px] font-mono text-muted-foreground/35 leading-relaxed">
              Hover or click<br />any cell to inspect
            </p>
          </div>
        )}
      </div>
    </div>
  );
}

/* ── Summary stat cards ──────────────────────────────────────── */
function StatCards({ data }: { data: HeatmapData }) {
  const pcr = data.putCallRatio;
  const sentiment = !pcr ? "neutral" : pcr > 1.3 ? "bearish" : pcr < 0.7 ? "bullish" : "neutral";
  return (
    <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
      <Card>
        <CardContent className="p-3 space-y-1">
          <p className="text-[9px] font-mono uppercase tracking-wider text-muted-foreground">Put / Call Ratio</p>
          <p className={`text-xl font-bold font-mono tabular-nums
            ${sentiment === "bearish" ? "text-red-400" : sentiment === "bullish" ? "text-emerald-400" : "text-foreground/80"}`}>
            {pcr?.toFixed(2) ?? "—"}
          </p>
          <p className="text-[10px] text-muted-foreground/60 font-mono capitalize">{sentiment} sentiment</p>
        </CardContent>
      </Card>
      <Card className="border-emerald-500/20 bg-emerald-500/5">
        <CardContent className="p-3 space-y-1">
          <p className="text-[9px] font-mono uppercase tracking-wider text-muted-foreground">Most Bullish Strike</p>
          <p className="text-xl font-bold font-mono text-emerald-400 tabular-nums">
            {data.bullishStrike ? `$${data.bullishStrike}` : "—"}
          </p>
          <p className="text-[10px] text-muted-foreground/60 font-mono">highest call volume</p>
        </CardContent>
      </Card>
      <Card className="border-red-500/20 bg-red-500/5">
        <CardContent className="p-3 space-y-1">
          <p className="text-[9px] font-mono uppercase tracking-wider text-muted-foreground">Most Bearish Strike</p>
          <p className="text-xl font-bold font-mono text-red-400 tabular-nums">
            {data.bearishStrike ? `$${data.bearishStrike}` : "—"}
          </p>
          <p className="text-[10px] text-muted-foreground/60 font-mono">highest put volume</p>
        </CardContent>
      </Card>
      <Card className="border-blue-500/20 bg-blue-500/5">
        <CardContent className="p-3 space-y-1">
          <p className="text-[9px] font-mono uppercase tracking-wider text-muted-foreground">Max Pain</p>
          <p className="text-xl font-bold font-mono text-blue-400 tabular-nums">${data.maxPainStrike}</p>
          <p className="text-[10px] text-muted-foreground/60 font-mono">option sellers win here</p>
        </CardContent>
      </Card>
    </div>
  );
}

/* ── GEX computation (Black-Scholes gamma approximation) ────── */
interface GEXPoint {
  strike:  number;
  callGEX: number;
  putGEX:  number;
  netGEX:  number;
}

function computeGEX(data: HeatmapData): GEXPoint[] {
  const S = data.currentPrice;
  const r = 0.045;
  const INV_SQRT_2PI = 0.3989422804;

  return data.strikes.map(strike => {
    let callGEX = 0;
    let putGEX  = 0;

    for (const exp of data.expirations) {
      const cell = data.cells[`${strike}-${exp}`];
      if (!cell) continue;
      const T = Math.max(1, daysToExp(exp)) / 365;
      const iv = (cell.callIV ?? cell.putIV ?? 0.3);
      if (iv <= 0 || T <= 0) continue;

      const sqrtT = Math.sqrt(T);
      const d1    = (Math.log(S / strike) + (r + iv * iv / 2) * T) / (iv * sqrtT);
      const gamma = (INV_SQRT_2PI * Math.exp(-d1 * d1 / 2)) / (S * iv * sqrtT);

      /* GEX in $M: OI × gamma × 100 (shares/contract) × S² (dollar gamma) / 1e6 */
      callGEX += (cell.callOI * gamma * 100 * S * S) / 1e6;
      putGEX  -= (cell.putOI  * gamma * 100 * S * S) / 1e6;
    }

    return {
      strike,
      callGEX: parseFloat(callGEX.toFixed(2)),
      putGEX:  parseFloat(putGEX.toFixed(2)),
      netGEX:  parseFloat((callGEX + putGEX).toFixed(2)),
    };
  });
}

/* ── GEX chart ───────────────────────────────────────────────── */
function GEXChart({ data }: { data: HeatmapData }) {
  const gex = useMemo(() => computeGEX(data), [data]);

  /* Gamma flip = strike where netGEX crosses zero */
  let flipStrike: number | null = null;
  for (let i = 0; i < gex.length - 1; i++) {
    if (Math.sign(gex[i].netGEX) !== Math.sign(gex[i + 1].netGEX)) {
      flipStrike = Math.round((gex[i].strike + gex[i + 1].strike) / 2);
      break;
    }
  }

  const totalNetGEX = gex.reduce((s, g) => s + g.netGEX, 0);
  const gexSentiment = totalNetGEX > 50 ? "bullish" : totalNetGEX < -50 ? "bearish" : "neutral";
  const dominator = gexSentiment === "bullish"
    ? "Dealers net long gamma → acts as price stabilizer"
    : gexSentiment === "bearish"
    ? "Dealers net short gamma → price moves amplified"
    : "Balanced gamma exposure";

  /* Format for display */
  const fmt = (n: number) => {
    const abs = Math.abs(n);
    if (abs >= 1000) return `${(n / 1000).toFixed(1)}B`;
    return `${n.toFixed(0)}M`;
  };

  return (
    <Card>
      <CardContent className="p-4 space-y-3">
        <div className="flex items-start justify-between flex-wrap gap-2">
          <div className="flex items-center gap-2">
            <Zap className="h-4 w-4 text-amber-400" />
            <span className="text-sm font-bold font-mono">Gamma Exposure (GEX) by Strike</span>
          </div>
          <div className="flex items-center gap-3 text-[10px] font-mono">
            <span className={`px-2 py-0.5 rounded border ${
              gexSentiment === "bullish" ? "border-emerald-500/30 text-emerald-400 bg-emerald-500/8" :
              gexSentiment === "bearish" ? "border-red-500/30 text-red-400 bg-red-500/8" :
              "border-border text-muted-foreground"
            }`}>
              Net GEX: {totalNetGEX >= 0 ? "+" : ""}{fmt(totalNetGEX)}
            </span>
            {flipStrike && (
              <span className="border border-blue-500/30 text-blue-400 px-2 py-0.5 rounded bg-blue-500/8">
                Flip ~${flipStrike}
              </span>
            )}
          </div>
        </div>

        <p className="text-[10px] font-mono text-muted-foreground/60">{dominator}</p>

        <div className="h-52">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={gex} margin={{ top: 4, right: 8, left: 0, bottom: 4 }}>
              <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="hsl(var(--border))" />
              <XAxis dataKey="strike"
                tickFormatter={v => `$${v}`}
                stroke="hsl(var(--muted-foreground))" fontSize={10}
                tickLine={false} axisLine={false}
                interval="preserveStartEnd"
              />
              <YAxis
                tickFormatter={v => `${v >= 0 ? "+" : ""}${fmt(v)}`}
                stroke="hsl(var(--muted-foreground))" fontSize={10}
                tickLine={false} axisLine={false} width={52}
              />
              <Tooltip
                contentStyle={{
                  backgroundColor: "hsl(var(--card))",
                  borderColor: "hsl(var(--border))",
                  borderRadius: "var(--radius)",
                  fontSize: "11px",
                  fontFamily: "monospace",
                }}
                formatter={(value: number, name: string) => [
                  `${value >= 0 ? "+" : ""}${fmt(value)}`,
                  name === "callGEX" ? "Call GEX" : name === "putGEX" ? "Put GEX" : "Net GEX",
                ]}
                labelFormatter={(l) => `Strike $${l}`}
              />
              <ReferenceLine y={0} stroke="hsl(var(--border))" strokeWidth={1.5} />
              {flipStrike && (
                <ReferenceLine x={flipStrike}
                  stroke="#60a5fa" strokeDasharray="4 3" strokeWidth={1.5}
                  label={{ value: `Flip ~$${flipStrike}`, position: "insideTopLeft",
                    style: { fontSize: 9, fontFamily: "monospace", fill: "#60a5fa", fillOpacity: 0.85 } }} />
              )}
              {data.currentPrice && (
                <ReferenceLine x={data.strikes.reduce((b, s) =>
                  Math.abs(s - data.currentPrice) < Math.abs(b - data.currentPrice) ? s : b,
                  data.strikes[0])}
                  stroke="hsl(var(--primary))" strokeDasharray="6 3" strokeWidth={1}
                  label={{ value: "ATM", position: "insideTopRight",
                    style: { fontSize: 9, fontFamily: "monospace", fill: "hsl(var(--primary))", fillOpacity: 0.85 } }} />
              )}
              <Bar dataKey="callGEX" name="callGEX" stackId="a" radius={0}>
                {gex.map((_, i) => (
                  <Cell key={i} fill="#10b981" fillOpacity={0.75} />
                ))}
              </Bar>
              <Bar dataKey="putGEX" name="putGEX" stackId="a" radius={[0, 0, 3, 3]}>
                {gex.map((_, i) => (
                  <Cell key={i} fill="#ef4444" fillOpacity={0.75} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>

        <div className="flex gap-4 text-[10px] font-mono text-muted-foreground">
          <span className="flex items-center gap-1.5">
            <span className="inline-block w-3 h-2.5 rounded-sm bg-emerald-500/75" />Call GEX (dealers long)
          </span>
          <span className="flex items-center gap-1.5">
            <span className="inline-block w-3 h-2.5 rounded-sm bg-red-500/75" />Put GEX (dealers short)
          </span>
          <span className="flex items-center gap-1.5">
            <span className="text-blue-400 font-bold">|</span>Gamma flip level
          </span>
        </div>
      </CardContent>
    </Card>
  );
}

/* ── Color legend ────────────────────────────────────────────── */
function Legend() {
  return (
    <div className="flex items-center gap-5 flex-wrap text-[10px] font-mono text-muted-foreground">
      <div className="flex items-center gap-2">
        <div className="flex gap-0.5">
          {[0.1, 0.3, 0.55, 0.75, 0.92].map(v => (
            <div key={v} className="w-3.5 h-3.5 rounded-sm"
              style={{ backgroundColor: `hsla(152, 72%, 45%, ${v})` }} />
          ))}
        </div>
        <span>Call-heavy</span>
      </div>
      <div className="flex items-center gap-2">
        <div className="flex gap-0.5">
          {[0.1, 0.3, 0.55, 0.75, 0.92].map(v => (
            <div key={v} className="w-3.5 h-3.5 rounded-sm"
              style={{ backgroundColor: `hsla(0, 72%, 45%, ${v})` }} />
          ))}
        </div>
        <span>Put-heavy</span>
      </div>
      <span className="text-blue-400 font-bold">MP</span><span>= Max Pain</span>
      <span className="border border-primary/30 text-primary px-1 rounded font-bold">ATM</span><span>= at-the-money row</span>
    </div>
  );
}

/* ── Skeleton ────────────────────────────────────────────────── */
function HeatSkeleton() {
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-4 gap-3">
        {[...Array(4)].map((_, i) => <Skeleton key={i} className="h-20 rounded-xl" />)}
      </div>
      <Skeleton className="h-[420px] rounded-xl" />
    </div>
  );
}

/* ── Page ────────────────────────────────────────────────────── */
const QUICK = ["NVDA", "AAPL", "TSLA", "SPY", "AMZN", "META", "AMD", "QQQ"];

export function ChainHeatmap() {
  const [input,  setInput]  = useState("NVDA");
  const [symbol, setSymbol] = useState("NVDA");

  const { data, isLoading, error } = useQuery<HeatmapData>({
    queryKey: ["options-heatmap", symbol],
    queryFn: async () => {
      const res = await fetch(`${BASE}/api/options-heatmap/${symbol}`);
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        throw new Error(j.error ?? "Failed to load chain");
      }
      return res.json();
    },
    staleTime:       3 * 60_000,
    refetchInterval: 5 * 60_000,
  });

  const go = (sym?: string) => {
    const s = (sym ?? input).trim().toUpperCase();
    if (s) { setInput(s); setSymbol(s); }
  };

  return (
    <Layout>
      <div className="space-y-5">

        {/* Header */}
        <div className="flex items-start gap-3 flex-wrap">
          <div className="flex items-center justify-center h-11 w-11 shrink-0 rounded-xl bg-violet-500/15 border border-violet-500/30">
            <Grid3x3 className="h-5 w-5 text-violet-400" />
          </div>
          <div>
            <h1 className="text-2xl font-bold font-mono">Options Chain Heatmap</h1>
            <p className="text-sm text-muted-foreground">
              Thermal view of call/put volume across all strikes &amp; expirations — see where money is concentrated
            </p>
          </div>
        </div>

        {/* Search */}
        <Card>
          <CardContent className="p-3 space-y-3">
            <div className="flex gap-2">
              <div className="relative flex-1">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <input
                  value={input}
                  onChange={e => setInput(e.target.value.toUpperCase())}
                  onKeyDown={e => e.key === "Enter" && go()}
                  placeholder="Enter ticker…"
                  className="w-full pl-9 pr-4 py-2.5 rounded-lg border border-border bg-card font-mono font-bold focus:outline-none focus:border-violet-500/50 transition-colors"
                />
              </div>
              <button
                onClick={() => go()}
                className="px-5 py-2 rounded-lg bg-violet-500/20 text-violet-300 border border-violet-500/30 text-sm font-bold hover:bg-violet-500/30 transition-colors"
              >
                Load Chain
              </button>
            </div>
            <div className="flex gap-1.5 flex-wrap">
              {QUICK.map(s => (
                <button key={s} onClick={() => go(s)}
                  className={`text-xs font-mono px-2.5 py-0.5 rounded border transition-colors
                    ${s === symbol
                      ? "border-violet-500/50 bg-violet-500/15 text-violet-300"
                      : "border-border text-muted-foreground hover:border-violet-400/30 hover:text-foreground"}`}>
                  {s}
                </button>
              ))}
            </div>
          </CardContent>
        </Card>

        {/* Loading */}
        {isLoading && (
          <div className="space-y-4">
            <div className="flex items-center gap-2 text-sm text-muted-foreground font-mono animate-pulse">
              <Activity className="h-4 w-4 text-violet-400" />
              Fetching {symbol} chain across all expirations…
            </div>
            <HeatSkeleton />
          </div>
        )}

        {/* Error */}
        {error && !isLoading && (
          <Card className="border-red-500/30 bg-red-500/5">
            <CardContent className="p-4 flex items-center gap-3 text-red-400 text-sm">
              <AlertTriangle className="h-4 w-4 shrink-0" />
              {(error as Error).message}
            </CardContent>
          </Card>
        )}

        {/* Data */}
        {data && !isLoading && (
          <div className="space-y-5">
            <StatCards data={data} />
            <Card>
              <CardContent className="p-4 space-y-4">
                <div className="flex items-center justify-between flex-wrap gap-2">
                  <span className="text-sm font-bold font-mono">
                    {data.symbol} · ${data.currentPrice.toFixed(2)} · {data.strikes.length} strikes × {data.expirations.length} expirations
                  </span>
                  <span className="text-[10px] text-muted-foreground/40 font-mono">
                    Updated {new Date(data.updatedAt).toLocaleTimeString()}
                  </span>
                </div>
                <Legend />
                <HeatGrid data={data} />
              </CardContent>
            </Card>
            <GEXChart data={data} />
          </div>
        )}

      </div>
    </Layout>
  );
}
