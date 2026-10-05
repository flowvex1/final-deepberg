import { useState, useEffect } from "react";
import { useLocation } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { Layout } from "@/components/layout";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import {
  LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, ReferenceLine,
} from "recharts";
import {
  GitCompare, Search, ArrowUpRight, ArrowDownRight,
  TrendingUp, TrendingDown, Minus,
} from "lucide-react";

const BASE = import.meta.env.BASE_URL.replace(/\/$/, "");

/* ── Types ─────────────────────────────────────────────────── */
interface StockData {
  symbol:        string;
  name:          string;
  sector:        string | null;
  price:         number | null;
  change:        number | null;
  changePercent: number | null;
  w52High:       number | null;
  w52Low:        number | null;
  w52Pos:        number | null;
  beta:          number | null;
  marketCap:     number | null;
  trailingPE:    number | null;
  forwardPE:     number | null;
  priceToSales:  number | null;
  priceToBook:   number | null;
  revenue:       number | null;
  eps:           number | null;
  forwardEps:    number | null;
  profitMargin:  number | null;
  dividendYield: number | null;
  volume:        number | null;
  avgVolume:     number | null;
  series:        { date: string; pct: number }[];
}
interface CompareData { a: StockData; b: StockData }

/* ── Formatters ────────────────────────────────────────────── */
function fmtPrice(n: number | null) {
  if (n == null) return "—";
  return `$${n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}
function fmtBig(n: number | null) {
  if (n == null) return "—";
  if (n >= 1e12) return `$${(n / 1e12).toFixed(2)}T`;
  if (n >= 1e9)  return `$${(n / 1e9).toFixed(2)}B`;
  if (n >= 1e6)  return `$${(n / 1e6).toFixed(2)}M`;
  return `$${n.toFixed(2)}`;
}
function fmtPct(n: number | null, mult = 1) {
  if (n == null) return "—";
  return `${(n * mult).toFixed(2)}%`;
}
function fmtNum(n: number | null, dec = 2) {
  if (n == null) return "—";
  return n.toFixed(dec);
}
function fmtVol(n: number | null) {
  if (n == null) return "—";
  if (n >= 1e6) return `${(n / 1e6).toFixed(1)}M`;
  if (n >= 1e3) return `${(n / 1e3).toFixed(0)}K`;
  return String(n);
}

/* ── Winner logic (null = neutral) ────────────────────────────
   Returns "a" | "b" | null for which value is "better" */
type WinDir = "a" | "b" | null;
function winLower(a: number | null, b: number | null): WinDir {
  if (a == null || b == null) return null;
  if (a < b) return "a";
  if (b < a) return "b";
  return null;
}
function winHigher(a: number | null, b: number | null): WinDir {
  if (a == null || b == null) return null;
  if (a > b) return "a";
  if (b > a) return "b";
  return null;
}

/* ── Metric row config ─────────────────────────────────────── */
interface MetricRow {
  label:    string;
  fmtA:     (s: StockData) => string;
  fmtB:     (s: StockData) => string;
  winner:   (a: StockData, b: StockData) => WinDir;
  note?:    string;
}

const SECTIONS: { title: string; rows: MetricRow[] }[] = [
  {
    title: "Price & Performance",
    rows: [
      { label: "Current Price",  fmtA: s => fmtPrice(s.price),          fmtB: s => fmtPrice(s.price),          winner: (a, b) => winHigher(a.price, b.price) },
      { label: "Day Change",     fmtA: s => s.changePercent != null ? `${s.changePercent >= 0 ? "+" : ""}${s.changePercent.toFixed(2)}%` : "—",
                                 fmtB: s => s.changePercent != null ? `${s.changePercent >= 0 ? "+" : ""}${s.changePercent.toFixed(2)}%` : "—",
                                 winner: (a, b) => winHigher(a.changePercent, b.changePercent) },
      { label: "52W High",       fmtA: s => fmtPrice(s.w52High),        fmtB: s => fmtPrice(s.w52High),        winner: (a, b) => winHigher(a.w52High, b.w52High) },
      { label: "52W Low",        fmtA: s => fmtPrice(s.w52Low),         fmtB: s => fmtPrice(s.w52Low),         winner: () => null },
      { label: "52W Range Pos.", fmtA: s => s.w52Pos != null ? `${s.w52Pos.toFixed(0)}%` : "—",
                                 fmtB: s => s.w52Pos != null ? `${s.w52Pos.toFixed(0)}%` : "—",
                                 winner: (a, b) => winHigher(a.w52Pos, b.w52Pos),
                                 note: "Where price sits in its 52W range" },
      { label: "Beta",           fmtA: s => fmtNum(s.beta),             fmtB: s => fmtNum(s.beta),             winner: () => null,
                                 note: "Volatility vs. market (1 = market)" },
      { label: "Volume",         fmtA: s => fmtVol(s.volume),           fmtB: s => fmtVol(s.volume),           winner: (a, b) => winHigher(a.volume, b.volume) },
      { label: "Avg Volume",     fmtA: s => fmtVol(s.avgVolume),        fmtB: s => fmtVol(s.avgVolume),        winner: () => null },
    ],
  },
  {
    title: "Valuation",
    rows: [
      { label: "Market Cap",     fmtA: s => fmtBig(s.marketCap),        fmtB: s => fmtBig(s.marketCap),        winner: (a, b) => winHigher(a.marketCap, b.marketCap) },
      { label: "Trailing P/E",   fmtA: s => fmtNum(s.trailingPE),       fmtB: s => fmtNum(s.trailingPE),       winner: (a, b) => winLower(a.trailingPE, b.trailingPE),
                                 note: "Lower = cheaper relative to earnings" },
      { label: "Forward P/E",    fmtA: s => fmtNum(s.forwardPE),        fmtB: s => fmtNum(s.forwardPE),        winner: (a, b) => winLower(a.forwardPE, b.forwardPE) },
      { label: "Price / Sales",  fmtA: s => fmtNum(s.priceToSales),     fmtB: s => fmtNum(s.priceToSales),     winner: (a, b) => winLower(a.priceToSales, b.priceToSales) },
      { label: "Price / Book",   fmtA: s => fmtNum(s.priceToBook),      fmtB: s => fmtNum(s.priceToBook),      winner: (a, b) => winLower(a.priceToBook, b.priceToBook) },
      { label: "Dividend Yield", fmtA: s => fmtPct(s.dividendYield, 100), fmtB: s => fmtPct(s.dividendYield, 100), winner: (a, b) => winHigher(a.dividendYield, b.dividendYield) },
    ],
  },
  {
    title: "Fundamentals",
    rows: [
      { label: "Revenue (TTM)",  fmtA: s => fmtBig(s.revenue),          fmtB: s => fmtBig(s.revenue),          winner: (a, b) => winHigher(a.revenue, b.revenue) },
      { label: "EPS (TTM)",      fmtA: s => s.eps != null ? `$${s.eps.toFixed(2)}` : "—",
                                 fmtB: s => s.eps != null ? `$${s.eps.toFixed(2)}` : "—",
                                 winner: (a, b) => winHigher(a.eps, b.eps) },
      { label: "Forward EPS",    fmtA: s => s.forwardEps != null ? `$${s.forwardEps.toFixed(2)}` : "—",
                                 fmtB: s => s.forwardEps != null ? `$${s.forwardEps.toFixed(2)}` : "—",
                                 winner: (a, b) => winHigher(a.forwardEps, b.forwardEps) },
      { label: "Profit Margin",  fmtA: s => fmtPct(s.profitMargin, 100), fmtB: s => fmtPct(s.profitMargin, 100), winner: (a, b) => winHigher(a.profitMargin, b.profitMargin),
                                 note: "Higher = more profitable per dollar of revenue" },
    ],
  },
];

/* ── Search bar pair ───────────────────────────────────────── */
function SearchPair({
  symA, symB, onCompare,
}: {
  symA: string; symB: string;
  onCompare: (a: string, b: string) => void;
}) {
  const [a, setA] = useState(symA);
  const [b, setB] = useState(symB);

  useEffect(() => { setA(symA); setB(symB); }, [symA, symB]);

  const go = () => {
    const ca = a.trim().toUpperCase();
    const cb = b.trim().toUpperCase();
    if (ca && cb && ca !== cb) onCompare(ca, cb);
  };

  const handleKey = (e: React.KeyboardEvent) => {
    if (e.key === "Enter") go();
  };

  return (
    <div className="flex items-center gap-3 flex-wrap">
      <div className="relative flex-1 min-w-[140px]">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <input
          value={a}
          onChange={e => setA(e.target.value.toUpperCase())}
          onKeyDown={handleKey}
          placeholder="AAPL"
          className="w-full pl-9 pr-4 py-2.5 rounded-xl border border-border bg-card font-mono font-bold text-lg focus:outline-none focus:border-primary/60 focus:bg-primary/5 transition-colors placeholder:font-normal placeholder:text-base"
        />
      </div>

      <div className="flex flex-col items-center shrink-0">
        <GitCompare className="h-6 w-6 text-muted-foreground" />
        <span className="text-[10px] font-bold font-mono text-muted-foreground/50 uppercase tracking-widest mt-0.5">VS</span>
      </div>

      <div className="relative flex-1 min-w-[140px]">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <input
          value={b}
          onChange={e => setB(e.target.value.toUpperCase())}
          onKeyDown={handleKey}
          placeholder="TSLA"
          className="w-full pl-9 pr-4 py-2.5 rounded-xl border border-border bg-card font-mono font-bold text-lg focus:outline-none focus:border-primary/60 focus:bg-primary/5 transition-colors placeholder:font-normal placeholder:text-base"
        />
      </div>

      <button
        onClick={go}
        disabled={!a.trim() || !b.trim()}
        className="px-6 py-2.5 rounded-xl bg-primary text-primary-foreground font-semibold text-sm hover:bg-primary/80 transition-colors disabled:opacity-40 disabled:cursor-not-allowed shrink-0"
      >
        Compare
      </button>
    </div>
  );
}

/* ── Stock header card ─────────────────────────────────────── */
function StockHeader({ stock, color }: { stock: StockData; color: string }) {
  const up = (stock.changePercent ?? 0) >= 0;
  return (
    <div className={`rounded-xl border p-5 ${color}`}>
      <div className="flex items-start justify-between gap-2 flex-wrap">
        <div>
          <p className="font-mono font-bold text-2xl">{stock.symbol}</p>
          <p className="text-sm text-muted-foreground truncate max-w-[200px]">{stock.name}</p>
          {stock.sector && (
            <p className="text-xs text-muted-foreground/60 mt-0.5">{stock.sector}</p>
          )}
        </div>
        <div className="text-right">
          <p className="font-mono font-bold text-2xl">{fmtPrice(stock.price)}</p>
          <p className={`flex items-center justify-end gap-0.5 text-sm font-mono font-bold ${up ? "text-emerald-400" : "text-red-400"}`}>
            {up ? <ArrowUpRight className="h-4 w-4" /> : <ArrowDownRight className="h-4 w-4" />}
            {up ? "+" : ""}{stock.changePercent?.toFixed(2)}%
          </p>
          {stock.w52Pos !== null && (
            <div className="mt-2">
              <div className="flex justify-between text-[10px] text-muted-foreground font-mono mb-0.5">
                <span>52W L</span><span>52W H</span>
              </div>
              <div className="relative h-1.5 w-32 bg-border rounded-full overflow-hidden">
                <div
                  className="absolute left-0 top-0 h-full rounded-full bg-primary"
                  style={{ width: `${Math.min(100, stock.w52Pos)}%` }}
                />
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

/* ── 30-day relative performance chart ─────────────────────── */
function PerfChart({ data, symA, symB }: { data: CompareData; symA: string; symB: string }) {
  const seriesA = data.a.series;
  const seriesB = data.b.series;

  /* Merge dates */
  const dateSetA = new Map(seriesA.map(x => [x.date, x.pct]));
  const dateSetB = new Map(seriesB.map(x => [x.date, x.pct]));
  const allDates = Array.from(new Set([...dateSetA.keys(), ...dateSetB.keys()])).sort();

  const merged = allDates.map(date => ({
    date: date.slice(5),
    [symA]: dateSetA.get(date) ?? null,
    [symB]: dateSetB.get(date) ?? null,
  }));

  if (merged.length === 0) return null;

  const lastA = seriesA[seriesA.length - 1]?.pct ?? 0;
  const lastB = seriesB[seriesB.length - 1]?.pct ?? 0;

  return (
    <Card>
      <CardContent className="p-5">
        <div className="flex items-center justify-between mb-4 flex-wrap gap-2">
          <h3 className="text-sm font-semibold">30-Day Relative Performance</h3>
          <div className="flex items-center gap-4 text-xs font-mono">
            <span className="flex items-center gap-1.5">
              <span className="h-2 w-6 rounded-full bg-blue-400 inline-block" />
              {symA}
              <span className={`font-bold ${lastA >= 0 ? "text-emerald-400" : "text-red-400"}`}>
                {lastA >= 0 ? "+" : ""}{lastA.toFixed(2)}%
              </span>
            </span>
            <span className="flex items-center gap-1.5">
              <span className="h-2 w-6 rounded-full bg-orange-400 inline-block" />
              {symB}
              <span className={`font-bold ${lastB >= 0 ? "text-emerald-400" : "text-red-400"}`}>
                {lastB >= 0 ? "+" : ""}{lastB.toFixed(2)}%
              </span>
            </span>
          </div>
        </div>
        <ResponsiveContainer width="100%" height={220}>
          <LineChart data={merged} margin={{ top: 4, right: 4, bottom: 0, left: 0 }}>
            <XAxis dataKey="date" tick={{ fontSize: 10, fill: "#6b7280" }} tickLine={false} axisLine={false} interval="preserveStartEnd" />
            <YAxis
              tickFormatter={v => `${v >= 0 ? "+" : ""}${v.toFixed(1)}%`}
              tick={{ fontSize: 10, fill: "#6b7280" }}
              tickLine={false} axisLine={false} width={52}
            />
            <Tooltip
              contentStyle={{ background: "#0a0a0a", border: "1px solid #27272a", borderRadius: 8, fontSize: 12 }}
              formatter={(v: any, name: string) => [`${(v as number) >= 0 ? "+" : ""}${(v as number).toFixed(2)}%`, name]}
              labelStyle={{ color: "#9ca3af" }}
            />
            <ReferenceLine y={0} stroke="#27272a" strokeDasharray="4 2" />
            <Line dataKey={symA} stroke="#60a5fa" strokeWidth={2} dot={false} connectNulls />
            <Line dataKey={symB} stroke="#fb923c" strokeWidth={2} dot={false} connectNulls />
          </LineChart>
        </ResponsiveContainer>
      </CardContent>
    </Card>
  );
}

/* ── Winner indicator ──────────────────────────────────────── */
function WinnerDot({ win, side }: { win: WinDir; side: "a" | "b" }) {
  if (win !== side) return <span className="w-2 h-2" />;
  return <span className="inline-flex items-center justify-center w-5 h-5 rounded-full bg-emerald-500/20 text-emerald-400 shrink-0"><TrendingUp className="h-3 w-3" /></span>;
}

/* ── Metrics comparison table ──────────────────────────────── */
function MetricsSection({ data }: { data: CompareData }) {
  return (
    <div className="space-y-4">
      {SECTIONS.map(section => (
        <Card key={section.title}>
          <CardContent className="p-0">
            <div className="px-5 py-3 border-b border-border/50">
              <h3 className="text-sm font-bold uppercase tracking-wider text-muted-foreground">{section.title}</h3>
            </div>
            <div className="divide-y divide-border/30">
              {section.rows.map(row => {
                const win = row.winner(data.a, data.b);
                const aWins = win === "a";
                const bWins = win === "b";
                return (
                  <div key={row.label} className="grid grid-cols-[1fr_auto_2fr_auto_1fr] items-center px-5 py-2.5 hover:bg-accent/10 transition-colors gap-3">
                    {/* Stock A value */}
                    <div className="flex items-center justify-end gap-2">
                      <WinnerDot win={win} side="a" />
                      <span className={`font-mono text-sm font-semibold text-right ${aWins ? "text-emerald-400" : bWins ? "text-foreground/50" : "text-foreground"}`}>
                        {row.fmtA(data.a)}
                      </span>
                    </div>

                    {/* Win indicator middle */}
                    <div className="flex items-center justify-center w-6">
                      {aWins ? <TrendingUp className="h-3 w-3 text-emerald-500/50" /> :
                       bWins ? <TrendingDown className="h-3 w-3 text-red-500/30" /> :
                       <Minus className="h-3 w-3 text-muted-foreground/20" />}
                    </div>

                    {/* Metric label */}
                    <div className="text-center">
                      <p className="text-xs text-muted-foreground font-medium">{row.label}</p>
                      {row.note && <p className="text-[10px] text-muted-foreground/50 hidden lg:block">{row.note}</p>}
                    </div>

                    {/* Win indicator middle right */}
                    <div className="flex items-center justify-center w-6">
                      {bWins ? <TrendingUp className="h-3 w-3 text-emerald-500/50" /> :
                       aWins ? <TrendingDown className="h-3 w-3 text-red-500/30" /> :
                       <Minus className="h-3 w-3 text-muted-foreground/20" />}
                    </div>

                    {/* Stock B value */}
                    <div className="flex items-center gap-2">
                      <span className={`font-mono text-sm font-semibold ${bWins ? "text-emerald-400" : aWins ? "text-foreground/50" : "text-foreground"}`}>
                        {row.fmtB(data.b)}
                      </span>
                      <WinnerDot win={win} side="b" />
                    </div>
                  </div>
                );
              })}
            </div>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}

/* ── Score summary ─────────────────────────────────────────── */
function ScoreSummary({ data }: { data: CompareData }) {
  let winsA = 0, winsB = 0;
  for (const section of SECTIONS) {
    for (const row of section.rows) {
      const w = row.winner(data.a, data.b);
      if (w === "a") winsA++;
      if (w === "b") winsB++;
    }
  }
  const total = winsA + winsB;
  const pctA = total > 0 ? Math.round((winsA / total) * 100) : 50;
  const pctB = 100 - pctA;
  const leader = winsA > winsB ? data.a.symbol : winsB > winsA ? data.b.symbol : null;

  return (
    <Card className="border-primary/20 bg-primary/5">
      <CardContent className="p-5">
        <div className="flex items-center gap-2 mb-4">
          <GitCompare className="h-4 w-4 text-primary" />
          <span className="text-xs font-bold uppercase tracking-wider text-primary font-mono">Metric Scorecard</span>
          {leader && (
            <span className="ml-auto text-xs text-muted-foreground">
              <span className="font-mono font-bold text-foreground">{leader}</span> leads on {Math.max(winsA, winsB)} of {total} metrics
            </span>
          )}
        </div>

        <div className="flex gap-1 h-3 rounded-full overflow-hidden mb-3">
          <div className="bg-blue-400 h-full rounded-l-full transition-all" style={{ width: `${pctA}%` }} />
          <div className="bg-orange-400 h-full rounded-r-full transition-all" style={{ width: `${pctB}%` }} />
        </div>

        <div className="flex justify-between text-xs font-mono">
          <span className="flex items-center gap-1.5">
            <span className="h-2 w-2 rounded-full bg-blue-400" />
            {data.a.symbol} <span className="font-bold">{winsA}</span> wins
          </span>
          <span className="flex items-center gap-1.5">
            {data.b.symbol} <span className="font-bold">{winsB}</span> wins
            <span className="h-2 w-2 rounded-full bg-orange-400" />
          </span>
        </div>
      </CardContent>
    </Card>
  );
}

/* ── Skeleton ──────────────────────────────────────────────── */
function CompareSkeleton() {
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-4">
        <Skeleton className="h-32 rounded-xl" />
        <Skeleton className="h-32 rounded-xl" />
      </div>
      <Skeleton className="h-64 rounded-xl" />
      <Skeleton className="h-8 rounded-xl" />
      {[...Array(3)].map((_, i) => <Skeleton key={i} className="h-48 rounded-xl" />)}
    </div>
  );
}

/* ── Main page ─────────────────────────────────────────────── */
export function ComparePage() {
  const [location] = useLocation();
  const params = new URLSearchParams(
    typeof window !== "undefined" ? window.location.search : ""
  );
  const initA = params.get("a")?.toUpperCase() ?? "";
  const initB = params.get("b")?.toUpperCase() ?? "";

  const [symA, setSymA] = useState(initA);
  const [symB, setSymB] = useState(initB);

  const ready = symA.length >= 1 && symB.length >= 1;

  const { data, isLoading, error } = useQuery<CompareData>({
    queryKey: ["compare", symA, symB],
    queryFn: async () => {
      const res = await fetch(`${BASE}/api/compare?a=${symA}&b=${symB}`);
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        throw new Error(j.error ?? "Failed to compare");
      }
      return res.json();
    },
    enabled: ready,
    staleTime: 2 * 60_000,
  });

  const onCompare = (a: string, b: string) => {
    setSymA(a);
    setSymB(b);
    if (typeof window !== "undefined") {
      window.history.replaceState(null, "", `${window.location.pathname}?a=${a}&b=${b}`);
    }
  };

  return (
    <Layout>
      <div className="space-y-6">

        {/* ── Header ─────────────────────────────────────────── */}
        <div className="flex items-center gap-3">
          <GitCompare className="h-7 w-7 text-primary" />
          <div>
            <h1 className="text-2xl font-bold font-mono">Stock Compare</h1>
            <p className="text-sm text-muted-foreground">Side-by-side fundamentals, valuation &amp; 30-day performance</p>
          </div>
        </div>

        {/* ── Search pair ────────────────────────────────────── */}
        <Card>
          <CardContent className="p-4">
            <SearchPair symA={symA} symB={symB} onCompare={onCompare} />
          </CardContent>
        </Card>

        {/* ── Quick suggestions ──────────────────────────────── */}
        {!ready && (
          <div className="flex flex-wrap gap-2">
            <span className="text-xs text-muted-foreground self-center mr-1">Try:</span>
            {[["AAPL","MSFT"],["NVDA","AMD"],["TSLA","F"],["AMZN","SHOP"],["META","SNAP"],["JPM","GS"]].map(([a,b]) => (
              <button
                key={`${a}-${b}`}
                onClick={() => onCompare(a, b)}
                className="text-xs font-mono px-2.5 py-1 rounded-lg border border-border hover:border-primary/40 hover:bg-primary/5 transition-colors"
              >
                {a} vs {b}
              </button>
            ))}
          </div>
        )}

        {/* ── Results ────────────────────────────────────────── */}
        {isLoading && <CompareSkeleton />}

        {error && (
          <Card className="border-red-500/30 bg-red-500/5">
            <CardContent className="p-5 text-sm text-red-400">
              {(error as Error).message}
            </CardContent>
          </Card>
        )}

        {data && !isLoading && (
          <div className="space-y-4">
            {/* Stock header cards */}
            <div className="grid grid-cols-2 gap-4">
              <StockHeader stock={data.a} color="border-blue-500/30 bg-blue-500/5" />
              <StockHeader stock={data.b} color="border-orange-500/30 bg-orange-500/5" />
            </div>

            {/* Score summary */}
            <ScoreSummary data={data} />

            {/* Performance chart */}
            <PerfChart data={data} symA={symA} symB={symB} />

            {/* Metric table */}
            <MetricsSection data={data} />
          </div>
        )}

        {/* ── Empty state ────────────────────────────────────── */}
        {!ready && !isLoading && (
          <div className="flex flex-col items-center justify-center py-20 gap-3 text-center text-muted-foreground">
            <GitCompare className="h-14 w-14 opacity-15" />
            <p className="font-semibold text-foreground/40">Enter two tickers above to compare</p>
          </div>
        )}

      </div>
    </Layout>
  );
}
