import { useState } from "react";
import { useLocation } from "wouter";
import { useGetIVRadar, getGetIVRadarQueryKey } from "@workspace/api-client-react";
import type { IVSymbolData } from "@workspace/api-client-react";
import { Layout } from "@/components/layout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { useLocalStorage } from "@/hooks/use-local-storage";
import {
  BarChart2, TrendingUp, TrendingDown, Minus, RefreshCw, Plus, X, ExternalLink,
} from "lucide-react";

const DEFAULT_WATCHLIST = ["NVDA", "TSLA", "AMD", "AAPL", "SPY", "QQQ", "META", "MSFT"];

function ivRankColor(rank: number) {
  if (rank >= 70) return { bar: "bg-red-500", text: "text-red-400", label: "HIGH" };
  if (rank >= 40) return { bar: "bg-amber-500", text: "text-amber-400", label: "MID" };
  return { bar: "bg-emerald-500", text: "text-emerald-400", label: "LOW" };
}

function IVRankBar({ rank }: { rank: number }) {
  const { bar, text, label } = ivRankColor(rank);
  return (
    <div className="flex items-center gap-2 min-w-[120px]">
      <div className="flex-1 h-1.5 rounded-full bg-muted overflow-hidden">
        <div className={`h-full rounded-full ${bar}`} style={{ width: `${Math.min(rank, 100)}%` }} />
      </div>
      <span className={`text-xs font-mono font-bold w-7 ${text}`}>{rank}</span>
      <span className={`text-xs font-mono ${text} w-8`}>{label}</span>
    </div>
  );
}

function RatioCell({ ratio }: { ratio: number }) {
  if (ratio > 1.5) return <span className="text-red-400 font-mono font-bold">{ratio.toFixed(2)}x</span>;
  if (ratio > 1.1) return <span className="text-amber-400 font-mono font-bold">{ratio.toFixed(2)}x</span>;
  if (ratio > 0.8) return <span className="text-muted-foreground font-mono">{ratio.toFixed(2)}x</span>;
  return <span className="text-emerald-400 font-mono font-bold">{ratio.toFixed(2)}x</span>;
}

function VolRatioCell({ ratio }: { ratio: number }) {
  if (ratio >= 2) return <span className="text-red-400 font-mono font-bold">{ratio.toFixed(1)}x 🔥</span>;
  if (ratio >= 1.5) return <span className="text-amber-400 font-mono">{ratio.toFixed(1)}x</span>;
  return <span className="text-muted-foreground font-mono">{ratio.toFixed(1)}x</span>;
}

function TermSlopeCell({ slope }: { slope: number }) {
  if (Math.abs(slope) < 1) return <span className="text-muted-foreground font-mono flex items-center gap-1"><Minus className="h-3 w-3" /> flat</span>;
  if (slope > 0) return <span className="text-amber-400 font-mono flex items-center gap-1"><TrendingDown className="h-3 w-3" /> backw.</span>;
  return <span className="text-emerald-400 font-mono flex items-center gap-1"><TrendingUp className="h-3 w-3" /> contango</span>;
}

function IVRow({ d, onNavigate }: { d: IVSymbolData; onNavigate: (s: string) => void }) {
  const isPositive = d.changePercent >= 0;
  return (
    <tr
      className="border-b border-border/40 hover:bg-accent/30 transition-colors cursor-pointer"
      onClick={() => onNavigate(d.symbol)}
    >
      <td className="px-4 py-3">
        <div className="flex items-center gap-2">
          <span className="font-mono font-bold text-primary">{d.symbol}</span>
          {d.error && <Badge variant="outline" className="text-xs text-destructive border-destructive/30">err</Badge>}
        </div>
      </td>
      <td className="px-4 py-3 font-mono text-sm">${d.price.toFixed(2)}</td>
      <td className={`px-4 py-3 font-mono text-sm ${isPositive ? "text-emerald-400" : "text-red-400"}`}>
        {isPositive ? "+" : ""}{d.changePercent.toFixed(2)}%
      </td>
      <td className="px-4 py-3 font-mono text-sm">
        {d.currentIV > 0 ? `${d.currentIV.toFixed(1)}%` : <span className="text-muted-foreground">—</span>}
      </td>
      <td className="px-4 py-3 font-mono text-sm text-muted-foreground">
        {d.hv30 > 0 ? `${d.hv30.toFixed(1)}%` : "—"}
      </td>
      <td className="px-4 py-3">
        {d.ivHvRatio > 0 ? <RatioCell ratio={d.ivHvRatio} /> : <span className="text-muted-foreground font-mono">—</span>}
      </td>
      <td className="px-4 py-3">
        {d.ivRank > 0 ? <IVRankBar rank={d.ivRank} /> : <span className="text-muted-foreground text-xs">N/A</span>}
      </td>
      <td className="px-4 py-3">
        <VolRatioCell ratio={d.volumeRatio} />
      </td>
      <td className="px-4 py-3">
        <TermSlopeCell slope={d.termSlope} />
      </td>
      <td className="px-4 py-3">
        <button
          className="text-muted-foreground hover:text-primary transition-colors"
          onClick={(e) => { e.stopPropagation(); onNavigate(d.symbol); }}
        >
          <ExternalLink className="h-4 w-4" />
        </button>
      </td>
    </tr>
  );
}

export function IVRadar() {
  const [, setLocation] = useLocation();
  const [customWatchlist, setCustomWatchlist] = useLocalStorage<string[]>("iv_watchlist", DEFAULT_WATCHLIST);
  const [addInput, setAddInput] = useState("");

  const { data, isLoading, isError, refetch, isFetching } = useGetIVRadar(
    { symbols: customWatchlist.join(",") },
    { query: { queryKey: getGetIVRadarQueryKey({ symbols: customWatchlist.join(",") }), refetchInterval: 5 * 60 * 1000 } }
  );

  const sorted = data ? [...data].sort((a, b) => b.ivRank - a.ivRank) : [];

  const addSymbol = () => {
    const s = addInput.trim().toUpperCase();
    if (s && !customWatchlist.includes(s)) {
      setCustomWatchlist((prev) => [...prev, s]);
    }
    setAddInput("");
  };

  const removeSymbol = (s: string) => setCustomWatchlist((prev) => prev.filter((x) => x !== s));

  const navigateToOptions = (symbol: string) => setLocation(`/options/${symbol}`);

  return (
    <Layout>
      <div className="space-y-6">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <h1 className="text-3xl font-bold tracking-tight flex items-center gap-3">
              <BarChart2 className="h-7 w-7 text-blue-400" />
              IV Radar
            </h1>
            <p className="text-muted-foreground mt-1">
              Implied volatility · historical vol · IV rank · term structure
            </p>
          </div>
          <button
            onClick={() => refetch()}
            disabled={isFetching}
            className="flex items-center gap-2 px-4 py-2 rounded-md border border-border bg-card text-sm hover:border-primary hover:text-primary transition-colors"
          >
            <RefreshCw className={`h-4 w-4 ${isFetching ? "animate-spin" : ""}`} />
            Refresh
          </button>
        </div>

        <Card>
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between flex-wrap gap-3">
              <CardTitle className="text-sm text-muted-foreground uppercase tracking-wider">Watchlist</CardTitle>
              <div className="flex items-center gap-2">
                <input
                  type="text"
                  value={addInput}
                  onChange={(e) => setAddInput(e.target.value.toUpperCase())}
                  onKeyDown={(e) => e.key === "Enter" && addSymbol()}
                  placeholder="Add ticker..."
                  className="w-32 px-2 py-1 h-8 rounded border border-border bg-background text-xs font-mono focus:outline-none focus:ring-1 focus:ring-primary"
                />
                <button
                  onClick={addSymbol}
                  className="h-8 px-3 rounded bg-primary text-primary-foreground text-xs font-mono hover:bg-primary/90 transition-colors flex items-center gap-1"
                >
                  <Plus className="h-3 w-3" /> Add
                </button>
              </div>
            </div>
            <div className="flex flex-wrap gap-2 mt-2">
              {customWatchlist.map((s) => (
                <div key={s} className="flex items-center gap-1 px-2 py-1 rounded-full border border-border bg-card text-xs font-mono">
                  <span>{s}</span>
                  <button onClick={() => removeSymbol(s)} className="text-muted-foreground hover:text-destructive transition-colors">
                    <X className="h-3 w-3" />
                  </button>
                </div>
              ))}
            </div>
          </CardHeader>
        </Card>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <Card className="bg-blue-500/5 border-blue-500/20">
            <CardContent className="p-4">
              <p className="text-xs text-muted-foreground uppercase tracking-wider mb-1">IV Rank Guide</p>
              <div className="space-y-1 text-xs font-mono">
                <div className="flex items-center gap-2"><div className="w-2 h-2 rounded-full bg-emerald-500" /><span>0–40: IV LOW — options cheap, consider buying</span></div>
                <div className="flex items-center gap-2"><div className="w-2 h-2 rounded-full bg-amber-500" /><span>40–70: IV MID — neutral pricing</span></div>
                <div className="flex items-center gap-2"><div className="w-2 h-2 rounded-full bg-red-500" /><span>70–100: IV HIGH — options expensive, consider selling</span></div>
              </div>
            </CardContent>
          </Card>
          <Card className="bg-purple-500/5 border-purple-500/20">
            <CardContent className="p-4">
              <p className="text-xs text-muted-foreground uppercase tracking-wider mb-1">IV/HV Ratio</p>
              <div className="space-y-1 text-xs font-mono">
                <div><span className="text-emerald-400">&lt;0.8x</span> — IV below realized vol (cheap)</div>
                <div><span className="text-muted-foreground">0.8–1.2x</span> — IV near fair value</div>
                <div><span className="text-red-400">&gt;1.5x</span> — IV well above realized (expensive)</div>
              </div>
            </CardContent>
          </Card>
          <Card className="bg-amber-500/5 border-amber-500/20">
            <CardContent className="p-4">
              <p className="text-xs text-muted-foreground uppercase tracking-wider mb-1">Term Structure</p>
              <div className="space-y-1 text-xs font-mono">
                <div><span className="text-amber-400">Backwardation</span> — near IV &gt; far IV (fear/event)</div>
                <div><span className="text-emerald-400">Contango</span> — near IV &lt; far IV (normal)</div>
                <div><span className="text-muted-foreground">Flat</span> — uniform pricing across expirations</div>
              </div>
            </CardContent>
          </Card>
        </div>

        <Card>
          <CardContent className="p-0">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border text-xs text-muted-foreground uppercase tracking-wider">
                    <th className="px-4 py-3 text-left">Symbol</th>
                    <th className="px-4 py-3 text-left">Price</th>
                    <th className="px-4 py-3 text-left">Chg%</th>
                    <th className="px-4 py-3 text-left">ATM IV</th>
                    <th className="px-4 py-3 text-left">HV30</th>
                    <th className="px-4 py-3 text-left">IV/HV</th>
                    <th className="px-4 py-3 text-left">IV Rank</th>
                    <th className="px-4 py-3 text-left">Vol Ratio</th>
                    <th className="px-4 py-3 text-left">Term</th>
                    <th className="px-4 py-3 text-left" />
                  </tr>
                </thead>
                <tbody>
                  {isLoading
                    ? [...Array(8)].map((_, i) => (
                      <tr key={i} className="border-b border-border/30">
                        {[...Array(9)].map((_, j) => (
                          <td key={j} className="px-4 py-3"><Skeleton className="h-4 w-16" /></td>
                        ))}
                        <td />
                      </tr>
                    ))
                    : sorted.map((d) => (
                      <IVRow key={d.symbol} d={d} onNavigate={navigateToOptions} />
                    ))
                  }
                </tbody>
              </table>
              {isError && (
                <div className="p-8 text-center text-red-300 text-sm">IV data is temporarily unavailable. Try again shortly.</div>
              )}
              {!isLoading && !isError && sorted.length === 0 && (
                <div className="p-8 text-center text-muted-foreground text-sm">No data — add tickers to your watchlist</div>
              )}
            </div>
          </CardContent>
        </Card>

        <p className="text-xs text-muted-foreground text-center">
          IV Rank is approximated from IV/HV ratio. ATM IV sourced from nearest expiry options chain. Data refreshes every 5 minutes.
        </p>
      </div>
    </Layout>
  );
}
