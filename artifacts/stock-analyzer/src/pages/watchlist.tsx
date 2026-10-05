import { useState, useRef } from "react";
import { Link } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { Layout } from "@/components/layout";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { useWatchlist } from "@/hooks/use-watchlist";
import {
  Bookmark, Plus, Trash2, Edit3, Check, X,
  ArrowUpRight, ArrowDownRight, TrendingUp, TrendingDown,
  DollarSign, Percent, BarChart3, AlertCircle,
} from "lucide-react";

const BASE = import.meta.env.BASE_URL.replace(/\/$/, "");

interface QuoteData {
  symbol: string;
  name?: string;
  price?: number | null;
  change?: number | null;
  changePercent?: number | null;
  marketCap?: number | null;
  fiftyTwoWeekLow?: number | null;
  fiftyTwoWeekHigh?: number | null;
  error?: boolean;
}

function fmt(n: number, dec = 2) {
  return n.toLocaleString("en-US", { minimumFractionDigits: dec, maximumFractionDigits: dec });
}
function fmtBig(n: number) {
  if (n >= 1e12) return `$${(n / 1e12).toFixed(2)}T`;
  if (n >= 1e9)  return `$${(n / 1e9).toFixed(2)}B`;
  if (n >= 1e6)  return `$${(n / 1e6).toFixed(2)}M`;
  return `$${fmt(n)}`;
}

/* ── Add / Edit form ──────────────────────────────────────── */
function AddForm({ onAdd, existing }: {
  onAdd: (symbol: string, shares: number, avgCost: number) => void;
  existing?: Set<string>;
}) {
  const [sym, setSym]       = useState("");
  const [shares, setShares] = useState("");
  const [cost, setCost]     = useState("");
  const [error, setError]   = useState("");

  const submit = () => {
    const s = sym.trim().toUpperCase();
    const sh = parseFloat(shares);
    const c  = parseFloat(cost);
    if (!s) { setError("Enter a ticker symbol"); return; }
    if (isNaN(sh) || sh <= 0) { setError("Enter a valid share count"); return; }
    if (isNaN(c) || c <= 0)  { setError("Enter a valid avg cost"); return; }
    setError("");
    onAdd(s, sh, c);
    setSym(""); setShares(""); setCost("");
  };

  return (
    <Card className="border-primary/30 bg-primary/5">
      <CardContent className="p-4">
        <p className="text-xs font-bold font-mono text-primary uppercase tracking-wider mb-3">Add Position</p>
        <div className="flex flex-wrap gap-2 items-end">
          <div className="flex flex-col gap-1">
            <label className="text-xs text-muted-foreground">Ticker</label>
            <input
              value={sym}
              onChange={(e) => setSym(e.target.value.toUpperCase())}
              onKeyDown={(e) => e.key === "Enter" && submit()}
              placeholder="AAPL"
              className="w-24 bg-background border border-border rounded-md px-2 py-1.5 text-sm font-mono focus:outline-none focus:border-primary/60 uppercase"
            />
          </div>
          <div className="flex flex-col gap-1">
            <label className="text-xs text-muted-foreground">Shares</label>
            <input
              value={shares}
              onChange={(e) => setShares(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && submit()}
              placeholder="10"
              type="number"
              min="0.001"
              step="any"
              className="w-24 bg-background border border-border rounded-md px-2 py-1.5 text-sm font-mono focus:outline-none focus:border-primary/60"
            />
          </div>
          <div className="flex flex-col gap-1">
            <label className="text-xs text-muted-foreground">Avg Cost ($)</label>
            <input
              value={cost}
              onChange={(e) => setCost(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && submit()}
              placeholder="150.00"
              type="number"
              min="0"
              step="any"
              className="w-28 bg-background border border-border rounded-md px-2 py-1.5 text-sm font-mono focus:outline-none focus:border-primary/60"
            />
          </div>
          <button
            onClick={submit}
            className="flex items-center gap-1.5 px-4 py-1.5 rounded-md bg-primary text-primary-foreground text-sm font-semibold hover:bg-primary/80 transition-colors"
          >
            <Plus className="h-4 w-4" />
            Add
          </button>
        </div>
        {error && <p className="text-xs text-red-400 mt-2 flex items-center gap-1"><AlertCircle className="h-3 w-3" />{error}</p>}
      </CardContent>
    </Card>
  );
}

/* ── Inline edit row ──────────────────────────────────────── */
function EditableRow({
  position, quote, onSave, onRemove,
}: {
  position: { symbol: string; shares: number; avgCost: number };
  quote: QuoteData | undefined;
  onSave: (shares: number, avgCost: number) => void;
  onRemove: () => void;
}) {
  const [editing, setEditing] = useState(false);
  const [shares, setShares]   = useState(String(position.shares));
  const [cost, setCost]       = useState(String(position.avgCost));

  const price    = quote?.price ?? null;
  const pctDay   = quote?.changePercent ?? null;
  const isUp     = pctDay !== null && pctDay >= 0;

  const currentValue = price !== null ? price * position.shares : null;
  const costBasis    = position.avgCost * position.shares;
  const pnlDollar    = currentValue !== null ? currentValue - costBasis : null;
  const pnlPct       = pnlDollar !== null ? (pnlDollar / costBasis) * 100 : null;
  const pnlPos       = pnlDollar !== null && pnlDollar >= 0;

  const save = () => {
    const sh = parseFloat(shares);
    const c  = parseFloat(cost);
    if (!isNaN(sh) && sh > 0 && !isNaN(c) && c > 0) {
      onSave(sh, c);
      setEditing(false);
    }
  };

  const w52Low  = quote?.fiftyTwoWeekLow ?? null;
  const w52High = quote?.fiftyTwoWeekHigh ?? null;
  const w52Pct  = (price !== null && w52Low !== null && w52High !== null && w52High > w52Low)
    ? ((price - w52Low) / (w52High - w52Low)) * 100
    : null;

  return (
    <tr className="border-b border-border/30 hover:bg-accent/20 transition-colors group">
      {/* Ticker + Name */}
      <td className="px-4 py-3">
        <Link href={`/stock/${position.symbol}`} className="flex flex-col hover:text-primary transition-colors">
          <span className="font-mono font-bold text-sm">{position.symbol}</span>
          <span className="text-xs text-muted-foreground truncate max-w-[120px]">{quote?.name ?? "—"}</span>
        </Link>
      </td>

      {/* Price + Day Change */}
      <td className="px-4 py-3 text-right">
        {price !== null ? (
          <div className="flex flex-col items-end">
            <span className="font-mono font-bold text-sm">${fmt(price)}</span>
            <span className={`text-xs font-mono flex items-center gap-0.5 ${isUp ? "text-emerald-400" : "text-red-400"}`}>
              {isUp ? <ArrowUpRight className="h-3 w-3" /> : <ArrowDownRight className="h-3 w-3" />}
              {isUp ? "+" : ""}{pctDay?.toFixed(2)}%
            </span>
          </div>
        ) : quote?.error ? (
          <span className="text-xs text-red-400">Error</span>
        ) : (
          <Skeleton className="h-8 w-16 ml-auto" />
        )}
      </td>

      {/* Shares / Avg Cost */}
      <td className="px-4 py-3 text-right">
        {editing ? (
          <div className="flex flex-col items-end gap-1">
            <input
              value={shares}
              onChange={(e) => setShares(e.target.value)}
              className="w-20 bg-background border border-border rounded px-2 py-0.5 text-xs font-mono text-right focus:outline-none focus:border-primary/60"
              type="number"
            />
            <input
              value={cost}
              onChange={(e) => setCost(e.target.value)}
              className="w-20 bg-background border border-border rounded px-2 py-0.5 text-xs font-mono text-right focus:outline-none focus:border-primary/60"
              type="number"
            />
          </div>
        ) : (
          <div className="flex flex-col items-end">
            <span className="font-mono text-sm">{fmt(position.shares, position.shares % 1 === 0 ? 0 : 3)}</span>
            <span className="text-xs text-muted-foreground font-mono">@ ${fmt(position.avgCost)}</span>
          </div>
        )}
      </td>

      {/* Current Value */}
      <td className="px-4 py-3 text-right">
        {currentValue !== null ? (
          <span className="font-mono font-semibold text-sm">${fmt(currentValue)}</span>
        ) : (
          <Skeleton className="h-5 w-20 ml-auto" />
        )}
        {costBasis > 0 && (
          <div className="text-xs text-muted-foreground font-mono mt-0.5">cost ${fmt(costBasis)}</div>
        )}
      </td>

      {/* P&L */}
      <td className="px-4 py-3 text-right">
        {pnlDollar !== null ? (
          <div className="flex flex-col items-end">
            <span className={`font-mono font-bold text-sm ${pnlPos ? "text-emerald-400" : "text-red-400"}`}>
              {pnlPos ? "+" : ""}${fmt(Math.abs(pnlDollar))}
            </span>
            <span className={`text-xs font-mono ${pnlPos ? "text-emerald-400" : "text-red-400"}`}>
              {pnlPos ? "+" : ""}{pnlPct?.toFixed(2)}%
            </span>
          </div>
        ) : (
          <Skeleton className="h-8 w-16 ml-auto" />
        )}
      </td>

      {/* 52W range bar */}
      <td className="px-4 py-3 hidden xl:table-cell">
        {w52Pct !== null ? (
          <div className="flex flex-col gap-1 w-28">
            <div className="relative h-1.5 rounded-full bg-border overflow-hidden">
              <div
                className="absolute left-0 top-0 h-full rounded-full bg-primary/60"
                style={{ width: `${Math.min(100, Math.max(0, w52Pct))}%` }}
              />
            </div>
            <div className="flex justify-between text-[10px] text-muted-foreground font-mono">
              <span>${w52Low?.toFixed(0)}</span>
              <span>${w52High?.toFixed(0)}</span>
            </div>
          </div>
        ) : null}
      </td>

      {/* Actions */}
      <td className="px-4 py-3">
        <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
          {editing ? (
            <>
              <button onClick={save} className="p-1.5 rounded-md bg-emerald-500/20 text-emerald-400 hover:bg-emerald-500/30 transition-colors">
                <Check className="h-3.5 w-3.5" />
              </button>
              <button onClick={() => setEditing(false)} className="p-1.5 rounded-md bg-border text-muted-foreground hover:bg-accent transition-colors">
                <X className="h-3.5 w-3.5" />
              </button>
            </>
          ) : (
            <>
              <button onClick={() => setEditing(true)} className="p-1.5 rounded-md hover:bg-accent text-muted-foreground hover:text-foreground transition-colors">
                <Edit3 className="h-3.5 w-3.5" />
              </button>
              <button onClick={onRemove} className="p-1.5 rounded-md hover:bg-red-500/20 text-muted-foreground hover:text-red-400 transition-colors">
                <Trash2 className="h-3.5 w-3.5" />
              </button>
            </>
          )}
        </div>
      </td>
    </tr>
  );
}

/* ── Main page ─────────────────────────────────────────────── */
export function WatchlistPage() {
  const { positions, addPosition, removePosition, updatePosition } = useWatchlist();
  const [showAdd, setShowAdd] = useState(false);

  const symbols = positions.map((p) => p.symbol);

  const { data: quotes, isLoading } = useQuery<QuoteData[]>({
    queryKey: ["watchlist-quotes", symbols.join(",")],
    queryFn: async () => {
      if (!symbols.length) return [];
      const res = await fetch(`${BASE}/api/watchlist/quotes?symbols=${symbols.join(",")}`);
      if (!res.ok) throw new Error("Failed");
      return res.json();
    },
    enabled: symbols.length > 0,
    refetchInterval: 30_000,
    staleTime: 15_000,
  });

  const quoteMap: Record<string, QuoteData> = {};
  (quotes ?? []).forEach((q) => { quoteMap[q.symbol] = q; });

  /* Portfolio summary */
  const totalCost    = positions.reduce((acc, p) => acc + p.shares * p.avgCost, 0);
  const totalCurrent = positions.reduce((acc, p) => {
    const q = quoteMap[p.symbol];
    return q?.price != null ? acc + q.price * p.shares : acc;
  }, 0);
  const totalPnl     = totalCurrent - totalCost;
  const totalPnlPct  = totalCost > 0 ? (totalPnl / totalCost) * 100 : 0;
  const pnlPos       = totalPnl >= 0;
  const hasLiveData  = Object.keys(quoteMap).length > 0;

  /* Day gain */
  const dayGain = positions.reduce((acc, p) => {
    const q = quoteMap[p.symbol];
    if (!q?.price || !q?.changePercent) return acc;
    const prev = q.price / (1 + q.changePercent / 100);
    return acc + (q.price - prev) * p.shares;
  }, 0);

  return (
    <Layout>
      <div className="flex flex-col gap-6">

        {/* ── Header ───────────────────────────────────────── */}
        <div className="flex items-start justify-between flex-wrap gap-3">
          <div className="flex items-center gap-3">
            <Bookmark className="h-7 w-7 text-emerald-400" />
            <div>
              <h1 className="text-2xl font-bold font-mono">Watchlist</h1>
              <p className="text-sm text-muted-foreground">Track positions · monitor P&amp;L · live quotes</p>
            </div>
          </div>
          <button
            onClick={() => setShowAdd((v) => !v)}
            className="flex items-center gap-1.5 px-4 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white text-sm font-semibold transition-colors"
          >
            <Plus className="h-4 w-4" />
            Add Position
          </button>
        </div>

        {/* ── Add form ─────────────────────────────────────── */}
        {showAdd && (
          <AddForm
            onAdd={(sym, sh, cost) => {
              addPosition(sym, sh, cost);
              setShowAdd(false);
            }}
            existing={new Set(positions.map((p) => p.symbol))}
          />
        )}

        {/* ── Summary cards ────────────────────────────────── */}
        {positions.length > 0 && (
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <Card className={`border ${hasLiveData ? (pnlPos ? "border-emerald-500/20 bg-emerald-500/5" : "border-red-500/20 bg-red-500/5") : "border-border"}`}>
              <CardContent className="p-4">
                <div className="flex items-center gap-1.5 mb-1 text-xs text-muted-foreground">
                  <DollarSign className="h-3.5 w-3.5" />
                  Portfolio Value
                </div>
                {hasLiveData ? (
                  <p className="font-mono font-bold text-xl">${fmt(totalCurrent)}</p>
                ) : (
                  <Skeleton className="h-7 w-28" />
                )}
                <p className="text-xs text-muted-foreground font-mono mt-0.5">cost ${fmt(totalCost)}</p>
              </CardContent>
            </Card>

            <Card className={`border ${hasLiveData ? (pnlPos ? "border-emerald-500/20 bg-emerald-500/5" : "border-red-500/20 bg-red-500/5") : "border-border"}`}>
              <CardContent className="p-4">
                <div className="flex items-center gap-1.5 mb-1 text-xs text-muted-foreground">
                  {pnlPos ? <TrendingUp className="h-3.5 w-3.5 text-emerald-400" /> : <TrendingDown className="h-3.5 w-3.5 text-red-400" />}
                  Total P&amp;L
                </div>
                {hasLiveData ? (
                  <>
                    <p className={`font-mono font-bold text-xl ${pnlPos ? "text-emerald-400" : "text-red-400"}`}>
                      {pnlPos ? "+" : ""}${fmt(Math.abs(totalPnl))}
                    </p>
                    <p className={`text-xs font-mono mt-0.5 ${pnlPos ? "text-emerald-400" : "text-red-400"}`}>
                      {pnlPos ? "+" : ""}{totalPnlPct.toFixed(2)}%
                    </p>
                  </>
                ) : (
                  <Skeleton className="h-7 w-24" />
                )}
              </CardContent>
            </Card>

            <Card className="border-border">
              <CardContent className="p-4">
                <div className="flex items-center gap-1.5 mb-1 text-xs text-muted-foreground">
                  <Percent className="h-3.5 w-3.5" />
                  Today's Gain
                </div>
                {hasLiveData ? (
                  <p className={`font-mono font-bold text-xl ${dayGain >= 0 ? "text-emerald-400" : "text-red-400"}`}>
                    {dayGain >= 0 ? "+" : ""}${fmt(Math.abs(dayGain))}
                  </p>
                ) : (
                  <Skeleton className="h-7 w-20" />
                )}
                <p className="text-xs text-muted-foreground mt-0.5">{positions.length} position{positions.length !== 1 ? "s" : ""}</p>
              </CardContent>
            </Card>

            <Card className="border-border">
              <CardContent className="p-4">
                <div className="flex items-center gap-1.5 mb-1 text-xs text-muted-foreground">
                  <BarChart3 className="h-3.5 w-3.5" />
                  Cost Basis
                </div>
                <p className="font-mono font-bold text-xl">${fmt(totalCost)}</p>
                <p className="text-xs text-muted-foreground mt-0.5 font-mono">avg cost</p>
              </CardContent>
            </Card>
          </div>
        )}

        {/* ── Positions table ───────────────────────────────── */}
        {positions.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-24 gap-4 text-center">
            <Bookmark className="h-12 w-12 text-muted-foreground/20" />
            <div>
              <p className="font-semibold text-foreground/60">Your watchlist is empty</p>
              <p className="text-sm text-muted-foreground mt-1">Add your first position to start tracking P&amp;L</p>
            </div>
            <button
              onClick={() => setShowAdd(true)}
              className="flex items-center gap-1.5 px-4 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white text-sm font-semibold transition-colors"
            >
              <Plus className="h-4 w-4" />
              Add First Position
            </button>
          </div>
        ) : (
          <Card>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border text-xs text-muted-foreground uppercase tracking-wider font-mono">
                    <th className="px-4 py-2.5 text-left">Ticker</th>
                    <th className="px-4 py-2.5 text-right">Price</th>
                    <th className="px-4 py-2.5 text-right">Shares / Cost</th>
                    <th className="px-4 py-2.5 text-right">Value</th>
                    <th className="px-4 py-2.5 text-right">Total P&amp;L</th>
                    <th className="px-4 py-2.5 hidden xl:table-cell">52W Range</th>
                    <th className="px-4 py-2.5 w-16" />
                  </tr>
                </thead>
                <tbody>
                  {positions.map((pos) => (
                    <EditableRow
                      key={pos.symbol}
                      position={pos}
                      quote={quoteMap[pos.symbol]}
                      onSave={(sh, cost) => updatePosition(pos.symbol, sh, cost)}
                      onRemove={() => removePosition(pos.symbol)}
                    />
                  ))}
                </tbody>
              </table>
            </div>
          </Card>
        )}

      </div>
    </Layout>
  );
}
