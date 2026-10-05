import { useState, useCallback, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Layout } from "@/components/layout";
import {
  AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer,
  CartesianGrid, ReferenceLine, PieChart, Pie, Cell
} from "recharts";
import {
  Search, TrendingUp, TrendingDown, DollarSign, RotateCcw,
  Settings, Plus, Minus, Loader2, AlertTriangle, X, ChevronUp, ChevronDown,
  ArrowUpRight, ArrowDownRight, Activity, Target, TrendingUpIcon, Zap
} from "lucide-react";

const BASE = import.meta.env.BASE_URL.replace(/\/$/, "");

const fmt = (n: number) =>
  new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", minimumFractionDigits: 2 }).format(n);
const fmtCompact = (n: number) =>
  new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", minimumFractionDigits: 0, maximumFractionDigits: 0 }).format(n);
const fmtPct = (n: number) => `${n >= 0 ? "+" : ""}${n.toFixed(2)}%`;
const fmtShares = (n: number) => (n % 1 === 0 ? n.toFixed(0) : n.toFixed(4));

interface Position {
  id: number; symbol: string; name: string; shares: number; avgCost: number;
  currentPrice: number; marketValue: number; costBasis: number;
  unrealizedPnl: number; unrealizedPct: number;
  stopLoss?: number | null; takeProfit?: number | null;
}
interface Portfolio {
  id: number; startingBalance: number; cash: number;
  totalMarketValue: number; totalEquity: number; totalPnl: number; totalPnlPct: number;
  positions: Position[];
}
interface Trade { id: number; symbol: string; name: string; type: string; shares: number; price: number; total: number; tradedAt: string; }
interface EquitySnapshot { id: number; equity: number; cash: number; marketValue: number; createdAt: string; }
interface ChartPoint { t: number; price: number; open?: number; high?: number; low?: number; close?: number; }

const PAPER_KEY = "deepberg_paper_portfolio_v1";

interface LocalPaperState {
  startingBalance: number;
  cash: number;
  positions: Array<Pick<Position, "id" | "symbol" | "name" | "shares" | "avgCost" | "stopLoss" | "takeProfit">>;
  trades: Trade[];
  snapshots: EquitySnapshot[];
}

function defaultPaperState(balance = 10_000): LocalPaperState {
  return {
    startingBalance: balance,
    cash: balance,
    positions: [],
    trades: [],
    snapshots: [{ id: Date.now(), equity: balance, cash: balance, marketValue: 0, createdAt: new Date().toISOString() }],
  };
}

function readPaperState(): LocalPaperState {
  try {
    return JSON.parse(localStorage.getItem(PAPER_KEY) ?? "null") ?? defaultPaperState();
  } catch {
    return defaultPaperState();
  }
}

function writePaperState(state: LocalPaperState) {
  localStorage.setItem(PAPER_KEY, JSON.stringify(state));
}

async function quoteFor(symbol: string) {
  const res = await fetch(`${BASE}/api/stocks/${encodeURIComponent(symbol)}`);
  const data = await res.json();
  if (!res.ok || !data?.price) throw new Error(data?.error ?? "Could not load quote");
  return { price: Number(data.price), name: String(data.name ?? symbol) };
}

async function apiFetch(path: string, opts?: RequestInit) {
  if (path.startsWith("/api/paper/")) {
    const state = readPaperState();
    const body = opts?.body ? JSON.parse(String(opts.body)) : {};

    if (path === "/api/paper/portfolio/setup") {
      const next = defaultPaperState(Number(body.balance));
      writePaperState(next);
      return next;
    }
    if (path === "/api/paper/portfolio/reset") {
      const next = defaultPaperState(state.startingBalance);
      writePaperState(next);
      return next;
    }
    if (path === "/api/paper/equity-history") return state.snapshots;
    if (path === "/api/paper/trades") return state.trades;

    const levelMatch = path.match(/^\/api\/paper\/positions\/([^/]+)\/levels$/);
    if (levelMatch) {
      const symbol = decodeURIComponent(levelMatch[1]).toUpperCase();
      state.positions = state.positions.map((position) =>
        position.symbol === symbol
          ? { ...position, stopLoss: body.stopLoss || null, takeProfit: body.takeProfit || null }
          : position
      );
      writePaperState(state);
      return { symbol, stopLoss: body.stopLoss || null, takeProfit: body.takeProfit || null };
    }

    const tradeMatch = path.match(/^\/api\/paper\/trade\/(buy|sell)$/);
    if (tradeMatch) {
      const type = tradeMatch[1];
      const symbol = String(body.symbol ?? "").toUpperCase();
      const shares = Number(body.shares);
      if (!symbol || !Number.isFinite(shares) || shares <= 0) throw new Error("Invalid trade");
      const { price, name } = await quoteFor(symbol);
      const total = price * shares;
      const existing = state.positions.find((position) => position.symbol === symbol);

      if (type === "buy") {
        if (state.cash < total) throw new Error("Insufficient demo cash");
        state.cash -= total;
        if (existing) {
          const nextShares = existing.shares + shares;
          existing.avgCost = ((existing.avgCost * existing.shares) + total) / nextShares;
          existing.shares = nextShares;
        } else {
          state.positions.push({ id: Date.now(), symbol, name, shares, avgCost: price });
        }
      } else {
        if (!existing || existing.shares < shares) throw new Error(`Not enough ${symbol} shares`);
        state.cash += total;
        existing.shares -= shares;
        if (existing.shares < 0.0001) state.positions = state.positions.filter((position) => position.symbol !== symbol);
      }

      const trade: Trade = { id: Date.now(), symbol, name, type, shares, price, total, tradedAt: new Date().toISOString() };
      state.trades.unshift(trade);
      state.snapshots.push({ id: Date.now(), equity: state.cash, cash: state.cash, marketValue: 0, createdAt: new Date().toISOString() });
      writePaperState(state);
      return { success: true, ...trade };
    }

    if (path === "/api/paper/portfolio") {
      const positions = await Promise.all(state.positions.map(async (position) => {
        const quote = await quoteFor(position.symbol).catch(() => ({ price: position.avgCost, name: position.name }));
        const marketValue = quote.price * position.shares;
        const costBasis = position.avgCost * position.shares;
        return {
          ...position,
          currentPrice: quote.price,
          marketValue,
          costBasis,
          unrealizedPnl: marketValue - costBasis,
          unrealizedPct: costBasis ? ((marketValue - costBasis) / costBasis) * 100 : 0,
        };
      }));
      const totalMarketValue = positions.reduce((sum, position) => sum + position.marketValue, 0);
      const totalEquity = state.cash + totalMarketValue;
      return {
        id: 1,
        startingBalance: state.startingBalance,
        cash: state.cash,
        positions,
        totalMarketValue,
        totalEquity,
        totalPnl: totalEquity - state.startingBalance,
        totalPnlPct: state.startingBalance ? ((totalEquity - state.startingBalance) / state.startingBalance) * 100 : 0,
      };
    }
  }

  const res = await fetch(`${BASE}${path}`, { headers: { "Content-Type": "application/json" }, ...opts });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error ?? "Request failed");
  return data;
}

const PERIODS = ["1m", "5m", "15m", "1d", "5d", "1mo"] as const;
type Period = typeof PERIODS[number];
const PERIOD_LABELS: Record<Period, string> = { "1m": "1m", "5m": "5m", "15m": "15m", "1d": "1D", "5d": "5D", "1mo": "1M" };

// ── Performance Metrics ────────────────────────────────────────────────────────
function PerformanceMetrics({ portfolio, trades }: { portfolio: Portfolio; trades: Trade[] }) {
  const completedTrades = trades.filter((t) => ["sell", "take_profit", "stop_loss"].includes(t.type));
  const winCount = completedTrades.filter((t) => t.type === "sell" || t.type === "take_profit").length;
  const winRate = completedTrades.length > 0 ? ((winCount / completedTrades.length) * 100) : 0;

  const bestTrade = completedTrades.length > 0
    ? Math.max(...completedTrades.map((t) => t.type === "take_profit" ? t.total : 0))
    : 0;
  const worstTrade = completedTrades.length > 0
    ? Math.min(...completedTrades.map((t) => t.type === "stop_loss" ? -Math.abs(t.total) : 0))
    : 0;

  const allEquities = [portfolio.startingBalance];
  const drawdowns = allEquities.map((eq) => ((portfolio.totalEquity - eq) / eq) * 100);
  const maxDD = Math.min(...drawdowns);

  return (
    <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
      <div className="rounded-lg border border-border bg-card/50 px-4 py-3">
        <p className="text-[10px] font-mono text-muted-foreground uppercase tracking-widest mb-1">Win Rate</p>
        <p className="text-xl font-bold font-mono">{winRate.toFixed(0)}%</p>
        <p className="text-xs text-muted-foreground mt-1">{winCount}/{completedTrades.length} trades</p>
      </div>
      <div className="rounded-lg border border-border bg-card/50 px-4 py-3">
        <p className="text-[10px] font-mono text-muted-foreground uppercase tracking-widest mb-1">Return</p>
        <p className={`text-xl font-bold font-mono ${portfolio.totalPnlPct >= 0 ? "text-emerald-400" : "text-red-400"}`}>
          {fmtPct(portfolio.totalPnlPct)}
        </p>
        <p className="text-xs text-muted-foreground mt-1">{fmt(portfolio.totalPnl)}</p>
      </div>
      <div className="rounded-lg border border-border bg-card/50 px-4 py-3">
        <p className="text-[10px] font-mono text-muted-foreground uppercase tracking-widest mb-1">Max Drawdown</p>
        <p className="text-xl font-bold font-mono text-red-400">{maxDD.toFixed(2)}%</p>
        <p className="text-xs text-muted-foreground mt-1">Peak to trough</p>
      </div>
      <div className="rounded-lg border border-border bg-card/50 px-4 py-3">
        <p className="text-[10px] font-mono text-muted-foreground uppercase tracking-widest mb-1">Allocation</p>
        <p className="text-xl font-bold font-mono">{((portfolio.totalMarketValue / portfolio.totalEquity) * 100).toFixed(0)}%</p>
        <p className="text-xs text-muted-foreground mt-1">Invested</p>
      </div>
    </div>
  );
}

// ── Position Allocation Pie ─────────────────────────────────────────────────────
function PositionAllocation({ positions }: { positions: Position[] }) {
  if (positions.length === 0) return null;

  const colors = ["#10b981", "#f59e0b", "#ef4444", "#3b82f6", "#8b5cf6", "#ec4899"];
  const data = positions.map((p) => ({ name: p.symbol, value: p.marketValue }));
  const total = data.reduce((sum, d) => sum + d.value, 0);

  return (
    <div className="rounded-xl border border-border bg-card p-4">
      <h3 className="font-bold font-mono text-sm mb-3 flex items-center gap-2">
        <Target className="h-4 w-4 text-emerald-400" /> Allocation
      </h3>
      <div className="flex items-center gap-4">
        <div style={{ width: 120, height: 120 }}>
          <ResponsiveContainer width="100%" height="100%">
            <PieChart>
              <Pie data={data} cx="50%" cy="50%" innerRadius={35} outerRadius={60} paddingAngle={2} dataKey="value">
                {data.map((_, i) => <Cell key={`cell-${i}`} fill={colors[i % colors.length]} />)}
              </Pie>
            </PieChart>
          </ResponsiveContainer>
        </div>
        <div className="text-xs space-y-1.5 flex-1">
          {data.map((d, i) => (
            <div key={d.name} className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <div className="w-2 h-2 rounded-full" style={{ background: colors[i % colors.length] }} />
                <span className="font-mono font-bold">{d.name}</span>
              </div>
              <span className="text-muted-foreground">{((d.value / total) * 100).toFixed(0)}%</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

// ── Equity Curve (Robinhood style) ───────────────────────────────────────────
function EquityCurve({ portfolio, snapshots }: { portfolio: Portfolio; snapshots: EquitySnapshot[] }) {
  const isPositive = portfolio.totalPnl >= 0;
  const color = isPositive ? "#10b981" : "#ef4444";

  const chartData = snapshots.length >= 2
    ? snapshots.map((s) => ({ time: new Date(s.createdAt).getTime(), equity: s.equity }))
    : [
        { time: Date.now() - 1000, equity: portfolio.startingBalance },
        { time: Date.now(), equity: portfolio.totalEquity },
      ];

  const minY = Math.min(...chartData.map((d) => d.equity)) * 0.998;
  const maxY = Math.max(...chartData.map((d) => d.equity)) * 1.002;

  return (
    <div className="rounded-xl border border-border bg-card px-6 pt-5 pb-2">
      {/* Header numbers */}
      <div className="flex items-end justify-between mb-1">
        <div>
          <p className="text-4xl font-black font-mono tracking-tight">{fmt(portfolio.totalEquity)}</p>
          <div className={`flex items-center gap-1.5 mt-1 text-sm font-mono font-bold ${isPositive ? "text-emerald-400" : "text-red-400"}`}>
            {isPositive ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
            {fmt(portfolio.totalPnl)} ({fmtPct(portfolio.totalPnlPct)}) all time
          </div>
        </div>
        <div className="flex gap-5 text-right text-sm">
          <div>
            <p className="text-[10px] font-mono text-muted-foreground uppercase tracking-widest">Cash</p>
            <p className="font-bold font-mono">{fmt(portfolio.cash)}</p>
          </div>
          <div>
            <p className="text-[10px] font-mono text-muted-foreground uppercase tracking-widest">Invested</p>
            <p className="font-bold font-mono">{fmt(portfolio.totalMarketValue)}</p>
          </div>
          <div>
            <p className="text-[10px] font-mono text-muted-foreground uppercase tracking-widest">Started</p>
            <p className="font-bold font-mono">{fmt(portfolio.startingBalance)}</p>
          </div>
        </div>
      </div>

      {/* Chart */}
      <div className="h-28">
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart data={chartData} margin={{ top: 4, right: 0, left: 0, bottom: 0 }}>
            <defs>
              <linearGradient id="equityGrad" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor={color} stopOpacity={0.3} />
                <stop offset="95%" stopColor={color} stopOpacity={0} />
              </linearGradient>
            </defs>
            <YAxis domain={[minY, maxY]} hide />
            <XAxis dataKey="time" hide />
            <ReferenceLine y={portfolio.startingBalance} stroke="rgba(255,255,255,0.15)" strokeDasharray="4 4" />
            <Tooltip
              content={({ active, payload }) => {
                if (!active || !payload?.length) return null;
                const val = payload[0].value as number;
                const diff = val - portfolio.startingBalance;
                return (
                  <div className="rounded-lg border border-border bg-card px-3 py-2 text-xs font-mono shadow-xl">
                    <p className="font-bold">{fmt(val)}</p>
                    <p className={diff >= 0 ? "text-emerald-400" : "text-red-400"}>{diff >= 0 ? "+" : ""}{fmt(diff)}</p>
                  </div>
                );
              }}
            />
            <Area type="monotone" dataKey="equity" stroke={color} strokeWidth={2} fill="url(#equityGrad)" dot={false} />
          </AreaChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}

// ── Stock Chart (TradingView style) ──────────────────────────────────────────
function StockChart({ symbol, onBuy, onSell, cash, existingPosition }: {
  symbol: string; onBuy: (price: number, qty: number) => void;
  onSell: (price: number, qty: number) => void; cash: number; existingPosition?: Position;
}) {
  const [period, setPeriod] = useState<Period>("5m");
  const [qty, setQty] = useState(1);
  const [slInput, setSlInput] = useState("");
  const [tpInput, setTpInput] = useState("");
  const [levelsMsg, setLevelsMsg] = useState<string | null>(null);
  const qc = useQueryClient();

  // Sync SL/TP inputs from the existing position whenever it changes
  useEffect(() => {
    setSlInput(existingPosition?.stopLoss != null ? String(existingPosition.stopLoss) : "");
    setTpInput(existingPosition?.takeProfit != null ? String(existingPosition.takeProfit) : "");
  }, [existingPosition?.stopLoss, existingPosition?.takeProfit, symbol]);

  const levelsMutation = useMutation({
    mutationFn: ({ sl, tp }: { sl: string; tp: string }) =>
      apiFetch(`/api/paper/positions/${symbol}/levels`, {
        method: "PUT",
        body: JSON.stringify({ stopLoss: sl === "" ? null : Number(sl), takeProfit: tp === "" ? null : Number(tp) }),
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["paper-portfolio"] });
      setLevelsMsg("Levels saved");
      setTimeout(() => setLevelsMsg(null), 2500);
    },
    onError: (e: Error) => { setLevelsMsg(e.message); setTimeout(() => setLevelsMsg(null), 3000); },
  });

  const { data: historyData, isLoading } = useQuery({
    queryKey: ["paper-chart", symbol, period],
    queryFn: () => apiFetch(`/api/stocks/${symbol}/history?period=${period}`),
    enabled: !!symbol,
    refetchInterval: 30000,
  });

  const { data: quote } = useQuery({
    queryKey: ["paper-quote", symbol],
    queryFn: () => apiFetch(`/api/stocks/${symbol}`),
    enabled: !!symbol,
    refetchInterval: 15000,
  });

  const chartPoints: ChartPoint[] = (Array.isArray(historyData) ? historyData : []).map((p: any) => ({
    t: typeof p.date === "number" ? p.date * 1000 : new Date(p.date).getTime(),
    price: p.close ?? p.adjClose ?? 0,
  })).filter((p: ChartPoint) => p.price > 0);

  const currentPrice: number = quote?.price ?? chartPoints[chartPoints.length - 1]?.price ?? 0;
  const change: number = quote?.change ?? 0;
  const changePct: number = quote?.changePercent ?? 0;
  const isUp = change >= 0;
  const lineColor = isUp ? "#10b981" : "#ef4444";

  const slVal = slInput !== "" && !isNaN(Number(slInput)) ? Number(slInput) : null;
  const tpVal = tpInput !== "" && !isNaN(Number(tpInput)) ? Number(tpInput) : null;

  const allPrices = [
    ...chartPoints.map(p => p.price),
    slVal, tpVal, existingPosition?.avgCost,
  ].filter((v): v is number => v != null && v > 0);

  const minY = allPrices.length ? Math.min(...allPrices) * 0.997 : 0;
  const maxY = allPrices.length ? Math.max(...allPrices) * 1.003 : 1;

  const openPrice = chartPoints[0]?.price;

  const formatXAxis = (tick: number) => {
    const d = new Date(tick);
    if (["1m", "5m", "15m", "1d"].includes(period)) return d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
    if (period === "5d") return d.toLocaleDateString([], { weekday: "short", month: "short", day: "numeric" });
    return d.toLocaleDateString([], { month: "short", day: "numeric" });
  };

  const canBuy = currentPrice > 0 && cash >= currentPrice * qty;
  const canSell = !!existingPosition && existingPosition.shares >= qty;
  const tradeCost = currentPrice * qty;
  const hasPosition = !!existingPosition;

  return (
    <div className="rounded-xl border border-border bg-card overflow-hidden flex flex-col h-full">
      {/* Chart header */}
      <div className="px-5 pt-4 pb-2 flex items-start justify-between gap-3">
        <div>
          <div className="flex items-baseline gap-2">
            <span className="text-2xl font-black font-mono">{currentPrice ? fmt(currentPrice) : "—"}</span>
            {change !== 0 && (
              <span className={`text-sm font-mono font-bold ${isUp ? "text-emerald-400" : "text-red-400"}`}>
                {isUp ? "+" : ""}{fmt(change)} ({fmtPct(changePct)})
              </span>
            )}
          </div>
          <p className="text-xs text-muted-foreground font-mono">{quote?.longName ?? quote?.shortName ?? symbol}</p>
        </div>
        <div className="flex items-center gap-1">
          {PERIODS.map((p) => (
            <button key={p} onClick={() => setPeriod(p)}
              className={`px-2.5 py-1 rounded text-xs font-mono font-bold transition-colors ${
                period === p ? "bg-accent text-foreground" : "text-muted-foreground hover:text-foreground"
              }`}>
              {PERIOD_LABELS[p]}
            </button>
          ))}
        </div>
      </div>

      {/* Chart area */}
      <div className="flex-1 min-h-0 px-2 pb-2" style={{ height: 280 }}>
        {isLoading ? (
          <div className="h-full flex items-center justify-center text-muted-foreground gap-2">
            <Loader2 className="h-4 w-4 animate-spin" /> Loading chart…
          </div>
        ) : chartPoints.length < 2 ? (
          <div className="h-full flex items-center justify-center text-muted-foreground text-sm">No chart data</div>
        ) : (
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={chartPoints} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
              <defs>
                <linearGradient id="stockGrad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor={lineColor} stopOpacity={0.25} />
                  <stop offset="95%" stopColor={lineColor} stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" />
              <XAxis dataKey="t" tickFormatter={formatXAxis} tick={{ fill: "#6b7280", fontSize: 10, fontFamily: "monospace" }} axisLine={false} tickLine={false} minTickGap={60} />
              <YAxis domain={[minY, maxY]} tick={{ fill: "#6b7280", fontSize: 10, fontFamily: "monospace" }} axisLine={false} tickLine={false} tickFormatter={(v) => `$${v.toFixed(0)}`} width={52} />
              {openPrice && <ReferenceLine y={openPrice} stroke="rgba(255,255,255,0.2)" strokeDasharray="4 3" />}
              {existingPosition && (
                <ReferenceLine y={existingPosition.avgCost} stroke="#f59e0b" strokeDasharray="5 3"
                  label={{ value: `Avg $${existingPosition.avgCost.toFixed(2)}`, fill: "#f59e0b", fontSize: 9, fontFamily: "monospace", position: "insideTopRight" }} />
              )}
              {slVal != null && (
                <ReferenceLine y={slVal} stroke="#ef4444" strokeDasharray="6 3" strokeWidth={1.5}
                  label={{ value: `SL $${slVal.toFixed(2)}`, fill: "#ef4444", fontSize: 9, fontFamily: "monospace", position: "insideBottomRight" }} />
              )}
              {tpVal != null && (
                <ReferenceLine y={tpVal} stroke="#10b981" strokeDasharray="6 3" strokeWidth={1.5}
                  label={{ value: `TP $${tpVal.toFixed(2)}`, fill: "#10b981", fontSize: 9, fontFamily: "monospace", position: "insideTopRight" }} />
              )}
              <Tooltip
                content={({ active, payload }) => {
                  if (!active || !payload?.length) return null;
                  const price = payload[0].value as number;
                  const diff = openPrice ? price - openPrice : 0;
                  return (
                    <div className="rounded-lg border border-border bg-card px-3 py-2 text-xs font-mono shadow-xl">
                      <p className="font-bold">{fmt(price)}</p>
                      {openPrice && <p className={diff >= 0 ? "text-emerald-400" : "text-red-400"}>{diff >= 0 ? "+" : ""}{fmt(diff)}</p>}
                      <p className="text-muted-foreground">{new Date(payload[0].payload.t).toLocaleString()}</p>
                    </div>
                  );
                }}
              />
              <Area type="monotone" dataKey="price" stroke={lineColor} strokeWidth={2} fill="url(#stockGrad)" dot={false} activeDot={{ r: 3, fill: lineColor }} />
            </AreaChart>
          </ResponsiveContainer>
        )}
      </div>

      {/* Trade bar */}
      <div className="border-t border-border px-5 py-3 flex items-center gap-3 bg-background/50 flex-wrap">
        <div className="flex items-center gap-2 shrink-0">
          <button onClick={() => setQty(Math.max(1, qty - 1))} className="p-1.5 rounded border border-border hover:bg-accent transition-colors"><Minus className="h-3 w-3" /></button>
          <input
            type="number" min={1} step={1} value={qty}
            onChange={(e) => setQty(Math.max(1, Number(e.target.value)))}
            className="w-16 py-1.5 px-2 rounded border border-border bg-background font-mono text-sm text-center focus:outline-none focus:ring-1 focus:ring-emerald-500"
          />
          <button onClick={() => setQty(qty + 1)} className="p-1.5 rounded border border-border hover:bg-accent transition-colors"><Plus className="h-3 w-3" /></button>
          <span className="text-xs text-muted-foreground font-mono">shares</span>
        </div>

        {currentPrice > 0 && (
          <span className="text-xs text-muted-foreground font-mono shrink-0">≈ {fmt(tradeCost)}</span>
        )}

        <div className="flex gap-2 ml-auto">
          <button
            onClick={() => onBuy(currentPrice, qty)}
            disabled={!canBuy}
            className="flex items-center gap-1.5 px-5 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-500 disabled:opacity-40 disabled:cursor-not-allowed text-white text-sm font-bold font-mono transition-colors"
          >
            <ArrowUpRight className="h-3.5 w-3.5" /> BUY
          </button>
          <button
            onClick={() => onSell(currentPrice, qty)}
            disabled={!canSell}
            className="flex items-center gap-1.5 px-5 py-2 rounded-lg bg-red-600 hover:bg-red-500 disabled:opacity-40 disabled:cursor-not-allowed text-white text-sm font-bold font-mono transition-colors"
          >
            <ArrowDownRight className="h-3.5 w-3.5" /> SELL
          </button>
        </div>

        {existingPosition && (
          <div className="text-xs font-mono text-muted-foreground shrink-0">
            Holding <span className="text-foreground font-bold">{fmtShares(existingPosition.shares)}</span> shares
            <span className={`ml-1 ${existingPosition.unrealizedPnl >= 0 ? "text-emerald-400" : "text-red-400"}`}>
              ({existingPosition.unrealizedPnl >= 0 ? "+" : ""}{fmt(existingPosition.unrealizedPnl)})
            </span>
          </div>
        )}
      </div>

      {/* SL / TP bar — always visible, grayed out when no position */}
      <div className={`border-t border-border px-5 py-2.5 flex items-center gap-3 flex-wrap transition-opacity ${hasPosition ? "opacity-100" : "opacity-40 pointer-events-none"}`}>
        <span className="text-[10px] font-mono text-muted-foreground uppercase tracking-widest shrink-0">Levels</span>

        {/* Stop Loss */}
        <div className="flex items-center gap-1.5">
          <span className="text-[10px] font-mono text-red-400 font-bold uppercase">SL</span>
          <div className="relative">
            <span className="absolute left-2 top-1/2 -translate-y-1/2 text-[10px] text-red-400 font-mono">$</span>
            <input
              type="number" step="0.01" min="0" placeholder="—"
              value={slInput}
              onChange={(e) => setSlInput(e.target.value)}
              className="w-24 pl-5 pr-2 py-1 rounded border border-red-500/30 bg-red-500/5 font-mono text-xs text-right focus:outline-none focus:ring-1 focus:ring-red-500/60 focus:border-red-500/60 placeholder:text-muted-foreground/40"
            />
          </div>
        </div>

        {/* Take Profit */}
        <div className="flex items-center gap-1.5">
          <span className="text-[10px] font-mono text-emerald-400 font-bold uppercase">TP</span>
          <div className="relative">
            <span className="absolute left-2 top-1/2 -translate-y-1/2 text-[10px] text-emerald-400 font-mono">$</span>
            <input
              type="number" step="0.01" min="0" placeholder="—"
              value={tpInput}
              onChange={(e) => setTpInput(e.target.value)}
              className="w-24 pl-5 pr-2 py-1 rounded border border-emerald-500/30 bg-emerald-500/5 font-mono text-xs text-right focus:outline-none focus:ring-1 focus:ring-emerald-500/60 focus:border-emerald-500/60 placeholder:text-muted-foreground/40"
            />
          </div>
        </div>

        {/* Quick fill suggestions */}
        {currentPrice > 0 && hasPosition && (
          <div className="flex gap-1">
            <button onClick={() => setSlInput((currentPrice * 0.97).toFixed(2))}
              className="text-[9px] font-mono text-red-400/70 hover:text-red-400 border border-red-500/20 hover:border-red-500/40 rounded px-1.5 py-0.5 transition-colors">-3%</button>
            <button onClick={() => setSlInput((currentPrice * 0.95).toFixed(2))}
              className="text-[9px] font-mono text-red-400/70 hover:text-red-400 border border-red-500/20 hover:border-red-500/40 rounded px-1.5 py-0.5 transition-colors">-5%</button>
            <button onClick={() => setTpInput((currentPrice * 1.05).toFixed(2))}
              className="text-[9px] font-mono text-emerald-400/70 hover:text-emerald-400 border border-emerald-500/20 hover:border-emerald-500/40 rounded px-1.5 py-0.5 transition-colors">+5%</button>
            <button onClick={() => setTpInput((currentPrice * 1.10).toFixed(2))}
              className="text-[9px] font-mono text-emerald-400/70 hover:text-emerald-400 border border-emerald-500/20 hover:border-emerald-500/40 rounded px-1.5 py-0.5 transition-colors">+10%</button>
          </div>
        )}

        <button
          onClick={() => levelsMutation.mutate({ sl: slInput, tp: tpInput })}
          disabled={levelsMutation.isPending || !hasPosition}
          className="ml-auto flex items-center gap-1.5 px-3 py-1 rounded border border-border bg-card hover:bg-accent text-xs font-mono font-bold disabled:opacity-40 transition-colors"
        >
          {levelsMutation.isPending ? <Loader2 className="h-3 w-3 animate-spin" /> : null}
          Set
        </button>

        {levelsMsg && (
          <span className={`text-[10px] font-mono ${levelsMsg === "Levels saved" ? "text-emerald-400" : "text-red-400"}`}>{levelsMsg}</span>
        )}
      </div>
    </div>
  );
}

// ── Setup modal ──────────────────────────────────────────────────────────────
function SetupModal({ current, onClose }: { current: number; onClose: () => void }) {
  const [value, setValue] = useState(current);
  const qc = useQueryClient();
  const mutation = useMutation({
    mutationFn: (balance: number) => apiFetch("/api/paper/portfolio/setup", { method: "POST", body: JSON.stringify({ balance }) }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["paper-portfolio"] }); qc.invalidateQueries({ queryKey: ["paper-equity"] }); qc.invalidateQueries({ queryKey: ["paper-trades"] }); onClose(); },
  });
  const presets = [1000, 5000, 10000, 25000, 50000, 100000];
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm">
      <div className="relative w-full max-w-md rounded-2xl border border-border bg-card p-6 shadow-2xl">
        <button onClick={onClose} className="absolute top-4 right-4 text-muted-foreground hover:text-foreground"><X className="h-4 w-4" /></button>
        <div className="flex items-center gap-2 mb-5">
          <Settings className="h-5 w-5 text-emerald-400" />
          <h2 className="font-bold text-lg font-mono">Portfolio Setup</h2>
        </div>
        <p className="text-sm text-muted-foreground mb-4">Set your virtual starting balance. Resets all positions and history.</p>
        <div className="grid grid-cols-3 gap-2 mb-4">
          {presets.map((p) => (
            <button key={p} onClick={() => setValue(p)}
              className={`rounded-lg border px-3 py-2 text-sm font-mono font-bold transition-colors ${value === p ? "border-emerald-500 bg-emerald-500/10 text-emerald-400" : "border-border bg-background text-muted-foreground hover:text-foreground"}`}>
              {fmtCompact(p)}
            </button>
          ))}
        </div>
        <div className="mb-5">
          <label className="text-xs font-mono text-muted-foreground uppercase tracking-widest mb-1.5 block">Custom Amount</label>
          <div className="relative">
            <DollarSign className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <input type="number" min={0} max={100000} step={500} value={value}
              onChange={(e) => setValue(Math.min(100000, Math.max(0, Number(e.target.value))))}
              className="w-full pl-8 pr-4 py-2.5 rounded-lg border border-border bg-background font-mono text-sm focus:outline-none focus:ring-1 focus:ring-emerald-500 focus:border-emerald-500" />
          </div>
          <input type="range" min={0} max={100000} step={500} value={value}
            onChange={(e) => setValue(Number(e.target.value))} className="w-full mt-2 accent-emerald-500" />
        </div>
        <button onClick={() => mutation.mutate(value)} disabled={mutation.isPending}
          className="w-full flex items-center justify-center gap-2 py-2.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white font-bold font-mono transition-colors">
          {mutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Settings className="h-4 w-4" />}
          Set Balance & Start Fresh
        </button>
        {mutation.isError && <p className="text-red-400 text-xs mt-2 text-center">{(mutation.error as Error).message}</p>}
      </div>
    </div>
  );
}

// ── Main page ────────────────────────────────────────────────────────────────
export function PaperTradingPage() {
  const [showSetup, setShowSetup] = useState(false);
  const [activeSymbol, setActiveSymbol] = useState("SPY");
  const [searchInput, setSearchInput] = useState("SPY");
  const [tradeToast, setTradeToast] = useState<string | null>(null);
  const qc = useQueryClient();

  const { data: portfolio, isLoading } = useQuery<Portfolio>({
    queryKey: ["paper-portfolio"],
    queryFn: () => apiFetch("/api/paper/portfolio"),
    refetchInterval: 20000,
  });

  const { data: equityHistory = [] } = useQuery<EquitySnapshot[]>({
    queryKey: ["paper-equity"],
    queryFn: () => apiFetch("/api/paper/equity-history"),
    refetchInterval: 30000,
  });

  const { data: trades = [] } = useQuery<Trade[]>({
    queryKey: ["paper-trades"],
    queryFn: () => apiFetch("/api/paper/trades"),
  });

  const resetMutation = useMutation({
    mutationFn: () => apiFetch("/api/paper/portfolio/reset", { method: "POST" }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["paper-portfolio"] }); qc.invalidateQueries({ queryKey: ["paper-equity"] }); qc.invalidateQueries({ queryKey: ["paper-trades"] }); },
  });

  const tradeMutation = useMutation({
    mutationFn: ({ type, symbol, shares }: { type: string; symbol: string; shares: number }) =>
      apiFetch(`/api/paper/trade/${type}`, { method: "POST", body: JSON.stringify({ symbol, shares }) }),
    onSuccess: (data, vars) => {
      qc.invalidateQueries({ queryKey: ["paper-portfolio"] });
      qc.invalidateQueries({ queryKey: ["paper-equity"] });
      qc.invalidateQueries({ queryKey: ["paper-trades"] });
      const msg = vars.type === "buy"
        ? `✓ Bought ${fmtShares(data.shares)} ${data.symbol} @ ${fmt(data.price)}`
        : `✓ Sold ${fmtShares(data.shares)} ${data.symbol} @ ${fmt(data.price)}${data.realizedPnl != null ? ` · P&L ${data.realizedPnl >= 0 ? "+" : ""}${fmt(data.realizedPnl)}` : ""}`;
      setTradeToast(msg);
      setTimeout(() => setTradeToast(null), 4000);
    },
    onError: (e: Error) => { setTradeToast(`✗ ${e.message}`); setTimeout(() => setTradeToast(null), 4000); },
  });

  const handleSearch = useCallback((e: React.FormEvent) => {
    e.preventDefault();
    const s = searchInput.trim().toUpperCase();
    if (s) setActiveSymbol(s);
  }, [searchInput]);

  const handleBuy = useCallback((price: number, qty: number) => {
    tradeMutation.mutate({ type: "buy", symbol: activeSymbol, shares: qty });
  }, [activeSymbol, tradeMutation]);

  const handleSell = useCallback((price: number, qty: number) => {
    tradeMutation.mutate({ type: "sell", symbol: activeSymbol, shares: qty });
  }, [activeSymbol, tradeMutation]);

  if (isLoading || !portfolio) {
    return (
      <div className="flex items-center justify-center h-64 text-muted-foreground gap-3">
        <Loader2 className="h-5 w-5 animate-spin" /> Loading portfolio…
      </div>
    );
  }

  const existingPosition = portfolio.positions.find((p) => p.symbol === activeSymbol);

  return (
    <Layout>
    <div className="max-w-7xl mx-auto space-y-4">
      {showSetup && <SetupModal current={portfolio.startingBalance} onClose={() => setShowSetup(false)} />}

      {/* Trade toast */}
      {tradeToast && (
        <div className={`fixed bottom-6 left-1/2 -translate-x-1/2 z-50 px-5 py-3 rounded-xl border shadow-2xl font-mono text-sm font-bold transition-all ${
          tradeToast.startsWith("✓") ? "bg-emerald-950 border-emerald-500/40 text-emerald-300" : "bg-red-950 border-red-500/40 text-red-300"
        }`}>
          {tradeToast}
        </div>
      )}

      {/* Top bar */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="p-2 rounded-lg bg-emerald-500/10 border border-emerald-500/30">
            <Activity className="h-5 w-5 text-emerald-400" />
          </div>
          <div>
            <h1 className="text-xl font-bold font-mono tracking-tight">Paper Trading</h1>
            <p className="text-xs text-muted-foreground">Virtual portfolio · real prices · no risk</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={() => { if (confirm("Reset portfolio to starting balance?")) resetMutation.mutate(); }}
            disabled={resetMutation.isPending}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-border bg-card text-muted-foreground hover:text-red-400 text-xs font-mono transition-colors">
            <RotateCcw className="h-3 w-3" /> Reset
          </button>
          <button onClick={() => setShowSetup(true)}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-emerald-500/40 bg-emerald-500/10 text-emerald-400 hover:bg-emerald-500/20 text-xs font-bold font-mono transition-colors">
            <Settings className="h-3 w-3" /> Setup
          </button>
        </div>
      </div>

      {/* Equity curve (Robinhood style) */}
      <EquityCurve portfolio={portfolio} snapshots={equityHistory} />

      {/* Performance metrics */}
      <PerformanceMetrics portfolio={portfolio} trades={trades} />

      {/* Main trading area */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4" style={{ minHeight: 460 }}>

        {/* Left: Stock chart */}
        <div className="lg:col-span-2 flex flex-col gap-3">
          {/* Symbol search */}
          <form onSubmit={handleSearch} className="flex gap-2">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <input value={searchInput} onChange={(e) => setSearchInput(e.target.value.toUpperCase())}
                placeholder="Search ticker…"
                className="w-full pl-9 pr-4 py-2 rounded-lg border border-border bg-card font-mono text-sm focus:outline-none focus:ring-1 focus:ring-emerald-500 focus:border-emerald-500 uppercase" />
            </div>
            <button type="submit" className="px-4 py-2 rounded-lg bg-card border border-border text-sm font-mono font-bold hover:bg-accent transition-colors">
              Go
            </button>
            {/* Quick picks */}
            {["SPY", "AAPL", "NVDA", "TSLA", "QQQ"].map((s) => (
              <button key={s} type="button"
                onClick={() => { setSearchInput(s); setActiveSymbol(s); }}
                className={`px-3 py-2 rounded-lg border text-xs font-mono font-bold transition-colors ${
                  activeSymbol === s ? "border-emerald-500/60 bg-emerald-500/10 text-emerald-400" : "border-border bg-card text-muted-foreground hover:text-foreground"
                }`}>
                {s}
              </button>
            ))}
          </form>

          {/* Chart */}
          <div className="flex-1">
            <StockChart
              symbol={activeSymbol}
              onBuy={handleBuy}
              onSell={handleSell}
              cash={portfolio.cash}
              existingPosition={existingPosition}
            />
          </div>
        </div>

        {/* Right: Positions + history + allocation */}
        <div className="flex flex-col gap-3 min-h-0">
          {/* Allocation pie */}
          {portfolio.positions.length > 0 && <PositionAllocation positions={portfolio.positions} />}

          {/* Positions */}
          <div className="rounded-xl border border-border bg-card overflow-hidden flex-1">
            <div className="px-4 py-3 border-b border-border">
              <h3 className="font-bold font-mono text-sm flex items-center gap-2">
                <TrendingUp className="h-3.5 w-3.5 text-emerald-400" /> Positions ({portfolio.positions.length})
              </h3>
            </div>
            {portfolio.positions.length === 0 ? (
              <div className="py-8 flex flex-col items-center gap-2 text-muted-foreground">
                <TrendingUp className="h-6 w-6 opacity-20" />
                <p className="text-xs">No open positions</p>
              </div>
            ) : (
              <div className="divide-y divide-border overflow-y-auto" style={{ maxHeight: 220 }}>
                {portfolio.positions.map((pos) => (
                  <button key={pos.id} onClick={() => { setActiveSymbol(pos.symbol); setSearchInput(pos.symbol); }}
                    className={`w-full px-4 py-2.5 flex items-center gap-3 hover:bg-accent/50 transition-colors text-left ${activeSymbol === pos.symbol ? "bg-accent/30" : ""}`}>
                    <div className="min-w-0 flex-1">
                      <div className="font-bold font-mono text-sm">{pos.symbol}</div>
                      <div className="text-[10px] text-muted-foreground">{fmtShares(pos.shares)} sh · avg {fmt(pos.avgCost)}</div>
                    </div>
                    <div className="text-right shrink-0">
                      <div className="font-mono text-xs font-bold">{fmt(pos.marketValue)}</div>
                      <div className={`text-[10px] font-mono ${pos.unrealizedPnl >= 0 ? "text-emerald-400" : "text-red-400"}`}>
                        {pos.unrealizedPnl >= 0 ? "+" : ""}{fmt(pos.unrealizedPnl)}
                      </div>
                    </div>
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Trade history */}
          <div className="rounded-xl border border-border bg-card overflow-hidden" style={{ maxHeight: 220 }}>
            <div className="px-4 py-3 border-b border-border">
              <h3 className="font-bold font-mono text-sm text-muted-foreground">Recent Trades</h3>
            </div>
            {trades.length === 0 ? (
              <div className="py-6 text-center text-xs text-muted-foreground">No trades yet</div>
            ) : (
              <div className="divide-y divide-border overflow-y-auto" style={{ maxHeight: 160 }}>
                {trades.slice(0, 20).map((t) => (
                  <div key={t.id} className="px-4 py-2 flex items-center gap-2">
                    <span className={`text-[9px] font-bold font-mono px-1.5 py-0.5 rounded border shrink-0 ${
                      t.type === "buy" ? "text-emerald-400 border-emerald-500/40 bg-emerald-500/10"
                      : t.type === "take_profit" ? "text-cyan-400 border-cyan-500/40 bg-cyan-500/10"
                      : t.type === "stop_loss" ? "text-orange-400 border-orange-500/40 bg-orange-500/10"
                      : "text-red-400 border-red-500/40 bg-red-500/10"
                    }`}>{t.type === "take_profit" ? "T/P" : t.type === "stop_loss" ? "S/L" : t.type.toUpperCase()}</span>
                    <span className="font-mono text-xs font-bold w-12 shrink-0">{t.symbol}</span>
                    <span className="text-[10px] text-muted-foreground flex-1">{fmtShares(t.shares)} @ {fmt(t.price)}</span>
                    <span className="text-[10px] font-mono text-muted-foreground shrink-0">{new Date(t.tradedAt).toLocaleTimeString()}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
    </Layout>
  );
}
