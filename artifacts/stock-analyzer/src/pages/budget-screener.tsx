import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import {
  DollarSign, Zap, TrendingUp, Target, Activity,
  BarChart2, AlertTriangle, Search, RotateCcw, ChevronRight,
  Loader2, CheckSquare, Square,
} from "lucide-react";
import { Layout } from "@/components/layout";

const BASE = import.meta.env.BASE_URL.replace(/\/$/, "");

const PRESET_BUDGETS = [100, 250, 500, 1000, 2500, 5000];

const ALL_TICKERS = [
  "NVDA", "TSLA", "AAPL", "SPY", "AMD", "META",
  "QQQ", "MSFT", "AMZN", "GOOGL", "PLTR", "COIN",
  "SOFI", "MSTR", "HOOD", "UBER",
];

interface BudgetResult {
  rank: number;
  symbol: string;
  currentPrice: number;
  type: string;
  strike: number;
  expiration: string;
  dte: number;
  bid: number;
  ask: number;
  mid: number;
  costPerContract: number;
  contractsAffordable: number;
  volume: number;
  openInterest: number;
  impliedVolatility: number;
  inTheMoney: boolean;
  score: number;
  scorePercent: number;
  riskScore: number;
  tags: string[];
  distancePct: number;
  breakeven: number;
  breakevenPct: number;
}

interface ScreenerResponse {
  budget: number;
  tickers: string[];
  results: BudgetResult[];
  scannedAt: string;
}

async function runScreener(budget: number, tickers: string[]): Promise<ScreenerResponse> {
  const res = await fetch(`${BASE}/api/options/budget-screener`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ budget, tickers }),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error((err as any).error ?? "Screener failed");
  }
  return res.json();
}

function scoreColor(pct: number): string {
  if (pct >= 70) return "text-emerald-400";
  if (pct >= 45) return "text-amber-400";
  return "text-red-400";
}

function riskLabel(score: number): { label: string; color: string } {
  if (score <= 30) return { label: "Low Risk",  color: "text-emerald-400 bg-emerald-500/10 border-emerald-500/30" };
  if (score <= 55) return { label: "Med Risk",  color: "text-amber-400 bg-amber-500/10 border-amber-500/30" };
  return               { label: "High Risk", color: "text-red-400 bg-red-500/10 border-red-500/30" };
}

function dteColor(dte: number): string {
  if (dte <= 7)  return "text-red-400";
  if (dte <= 14) return "text-amber-400";
  if (dte <= 60) return "text-emerald-400";
  return "text-blue-400";
}

export function BudgetScreenerPage() {
  const [budget, setBudget] = useState(500);
  const [rawInput, setRawInput] = useState("500");
  const [selectedTickers, setSelectedTickers] = useState<Set<string>>(new Set(ALL_TICKERS));

  const { mutate, data, isPending, error, reset } = useMutation<ScreenerResponse, Error, { budget: number; tickers: string[] }>({
    mutationFn: ({ budget, tickers }) => runScreener(budget, tickers),
  });

  const toggleTicker = (t: string) => {
    setSelectedTickers(prev => {
      const next = new Set(prev);
      if (next.has(t)) { if (next.size > 1) next.delete(t); }
      else next.add(t);
      return next;
    });
  };

  const handleScan = () => {
    const b = Number(rawInput.replace(/[^0-9.]/g, ""));
    if (!b || b < 10) return;
    setBudget(b);
    mutate({ budget: b, tickers: Array.from(selectedTickers) });
  };

  return (
    <Layout>
      <div className="space-y-6 max-w-6xl">

        {/* ── Page header ───────────────────────────────── */}
        <div className="flex justify-between items-end gap-4">
          <div className="flex flex-col gap-1">
            <h1 className="text-3xl font-bold font-sans uppercase flex items-center gap-3">
              <DollarSign className="h-7 w-7 text-emerald-400 shrink-0" />
              Budget Screener
            </h1>
            <p className="text-muted-foreground text-sm">
              Enter your budget — get the highest-scored call options you can actually buy.
            </p>
          </div>
          <div className="regime-pill hidden sm:flex items-center gap-2 px-4 py-2 rounded-lg shrink-0">
            <span className="w-2 h-2 rounded-full bg-blue-400 animate-pulse" style={{ boxShadow: "0 0 6px #4d8eff" }} />
            <div className="flex flex-col items-end">
              <span className="text-[9px] font-mono text-slate-500 uppercase tracking-widest leading-none">Mode</span>
              <span className="text-xs font-bold text-blue-400 font-sans uppercase tracking-wider leading-none mt-0.5">Calls Only</span>
            </div>
          </div>
        </div>

        {/* ── Config panel ─────────────────────────────── */}
        <div className="rounded-xl border border-border bg-card overflow-hidden">
          <div className="card-header-strip px-4 py-3 flex items-center gap-2">
            <Target className="h-3.5 w-3.5 text-blue-400" />
            <span className="text-[11px] font-bold font-sans uppercase tracking-widest text-slate-400">
              Configure Screener
            </span>
          </div>
          <div className="p-5 space-y-5">

            {/* Budget input */}
            <div className="space-y-3">
              <label className="text-[10px] font-bold uppercase tracking-widest text-slate-500 font-sans">
                Your Budget
              </label>
              <div className="flex items-center gap-3">
                <div
                  className="flex items-center gap-2 px-4 py-2.5 rounded-lg flex-1 max-w-xs"
                  style={{ background: "rgba(0,0,0,0.4)", border: "1px solid rgba(255,255,255,0.1)" }}
                >
                  <span className="text-emerald-400 font-bold text-lg font-mono">$</span>
                  <input
                    type="text"
                    inputMode="numeric"
                    value={rawInput}
                    onChange={(e) => setRawInput(e.target.value)}
                    onKeyDown={(e) => e.key === "Enter" && handleScan()}
                    placeholder="500"
                    className="bg-transparent border-none outline-none text-white font-mono text-lg w-full"
                  />
                </div>
                <div className="flex gap-2 flex-wrap">
                  {PRESET_BUDGETS.map((b) => (
                    <button
                      key={b}
                      onClick={() => { setRawInput(String(b)); setBudget(b); }}
                      className={`px-3 py-1.5 rounded-lg text-[11px] font-bold font-mono uppercase tracking-wider transition-all duration-150 ${
                        Number(rawInput) === b
                          ? "bg-blue-500/20 text-blue-400 border border-blue-500/50"
                          : "bg-white/5 text-slate-500 border border-white/8 hover:bg-white/10 hover:text-slate-300"
                      }`}
                    >
                      ${b >= 1000 ? `${b / 1000}k` : b}
                    </button>
                  ))}
                </div>
              </div>
              <p className="text-[10px] text-slate-600 font-mono">
                Cost = ask price × 100 shares per contract. All results will be ≤ ${Number(rawInput) || budget} per contract.
              </p>
            </div>

            {/* Ticker selection */}
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <label className="text-[10px] font-bold uppercase tracking-widest text-slate-500 font-sans">
                  Scan Tickers ({selectedTickers.size}/{ALL_TICKERS.length} selected)
                </label>
                <div className="flex gap-2">
                  <button
                    onClick={() => setSelectedTickers(new Set(ALL_TICKERS))}
                    className="text-[10px] text-slate-500 hover:text-slate-300 font-mono uppercase tracking-wider transition-colors"
                  >
                    All
                  </button>
                  <span className="text-slate-700">·</span>
                  <button
                    onClick={() => setSelectedTickers(new Set([ALL_TICKERS[0]]))}
                    className="text-[10px] text-slate-500 hover:text-slate-300 font-mono uppercase tracking-wider transition-colors"
                  >
                    Clear
                  </button>
                </div>
              </div>
              <div className="flex flex-wrap gap-2">
                {ALL_TICKERS.map((t) => {
                  const active = selectedTickers.has(t);
                  return (
                    <button
                      key={t}
                      onClick={() => toggleTicker(t)}
                      className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[11px] font-bold font-mono uppercase tracking-wider transition-all duration-150 border ${
                        active
                          ? "bg-blue-500/15 text-blue-300 border-blue-500/40"
                          : "bg-white/3 text-slate-600 border-white/8 hover:bg-white/8 hover:text-slate-400"
                      }`}
                    >
                      {active
                        ? <CheckSquare className="h-3 w-3 shrink-0" />
                        : <Square className="h-3 w-3 shrink-0" />}
                      {t}
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Scan button */}
            <div className="flex items-center gap-3 pt-1">
              <button
                onClick={handleScan}
                disabled={isPending || selectedTickers.size === 0}
                className="flex items-center gap-2 px-6 py-3 rounded-xl font-bold text-sm font-sans uppercase tracking-widest transition-all duration-200 disabled:opacity-50 disabled:cursor-not-allowed"
                style={{
                  background: isPending ? "rgba(59,130,246,0.2)" : "rgba(59,130,246,0.9)",
                  color: "#fff",
                  boxShadow: isPending ? "none" : "0 0 24px rgba(59,130,246,0.3)",
                }}
              >
                {isPending
                  ? <Loader2 className="h-4 w-4 animate-spin" />
                  : <Search className="h-4 w-4" />}
                {isPending ? "Scanning..." : "Scan Options"}
                {!isPending && <ChevronRight className="h-4 w-4" />}
              </button>
              {(data || error) && !isPending && (
                <button
                  onClick={() => reset()}
                  className="flex items-center gap-2 px-4 py-3 rounded-xl text-sm font-mono text-slate-500 hover:text-slate-300 transition-colors"
                >
                  <RotateCcw className="h-3.5 w-3.5" /> Reset
                </button>
              )}
            </div>
          </div>
        </div>

        {/* ── Scanning pulse ───────────────────────────── */}
        {isPending && (
          <div className="rounded-xl border border-blue-500/20 bg-blue-500/5 p-6 flex items-center gap-4">
            <div className="relative">
              <div className="h-10 w-10 rounded-full border-2 border-blue-500/30 flex items-center justify-center">
                <Loader2 className="h-5 w-5 text-blue-400 animate-spin" />
              </div>
              <span className="absolute -top-0.5 -right-0.5 h-3 w-3 rounded-full bg-blue-400 animate-ping" />
            </div>
            <div>
              <p className="text-sm font-bold text-blue-300 font-sans uppercase tracking-wider">Scanning {selectedTickers.size} tickers…</p>
              <p className="text-xs text-slate-500 font-mono mt-0.5">Fetching live options chains · filtering by ${Number(rawInput) || budget} budget · scoring contracts</p>
            </div>
          </div>
        )}

        {/* ── Error ────────────────────────────────────── */}
        {error && (
          <div className="rounded-xl border border-red-500/30 bg-red-500/5 p-4 flex items-center gap-3">
            <AlertTriangle className="h-5 w-5 text-red-400 shrink-0" />
            <p className="text-sm text-red-300">{error.message}</p>
          </div>
        )}

        {/* ── Results ──────────────────────────────────── */}
        {data && data.results.length === 0 && (
          <div className="rounded-xl border border-border bg-card p-8 text-center space-y-2">
            <DollarSign className="h-8 w-8 text-slate-600 mx-auto" />
            <p className="text-slate-400 font-sans uppercase tracking-wider text-sm">No affordable calls found</p>
            <p className="text-xs text-slate-600 font-mono">Try increasing your budget or selecting more tickers.</p>
          </div>
        )}

        {data && data.results.length > 0 && (
          <div className="space-y-4">
            {/* Summary bar */}
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Zap className="h-4 w-4 text-emerald-400" />
                <span className="text-sm font-bold font-sans uppercase tracking-wider text-slate-300">
                  {data.results.length} Calls Found
                </span>
                <span className="text-xs text-slate-600 font-mono">— all ≤ ${data.budget}/contract · ranked by score</span>
              </div>
              <span className="text-[10px] text-slate-600 font-mono uppercase tracking-wider">
                Scanned {new Date(data.scannedAt).toLocaleTimeString()}
              </span>
            </div>

            {/* Cards */}
            <div className="space-y-3">
              {data.results.map((r) => {
                const risk = riskLabel(r.riskScore);
                return (
                  <div
                    key={`${r.symbol}-${r.strike}-${r.expiration}`}
                    className="rounded-xl border border-border bg-card overflow-hidden hover:border-blue-500/30 transition-colors duration-200"
                    style={{ background: "rgba(19,19,21,0.6)" }}
                  >
                    <div className="p-4 grid grid-cols-12 gap-4 items-center">

                      {/* Rank + symbol */}
                      <div className="col-span-12 sm:col-span-3 flex items-center gap-3">
                        <div
                          className="w-8 h-8 rounded-lg flex items-center justify-center shrink-0 font-bold text-sm font-mono"
                          style={{
                            background: r.rank <= 3 ? "rgba(59,130,246,0.2)" : "rgba(255,255,255,0.05)",
                            border: r.rank <= 3 ? "1px solid rgba(59,130,246,0.4)" : "1px solid rgba(255,255,255,0.08)",
                            color: r.rank <= 3 ? "#93c5fd" : "#64748b",
                          }}
                        >
                          #{r.rank}
                        </div>
                        <div>
                          <div className="flex items-center gap-2">
                            <span className="font-bold text-white font-sans text-base">{r.symbol}</span>
                            <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-blue-500/15 text-blue-300 border border-blue-500/30 font-mono uppercase">
                              CALL
                            </span>
                          </div>
                          <span className="text-xs text-slate-500 font-mono">${r.currentPrice.toFixed(2)} now</span>
                        </div>
                      </div>

                      {/* Strike / Expiry / DTE */}
                      <div className="col-span-6 sm:col-span-2 space-y-0.5">
                        <div className="text-[10px] uppercase tracking-widest text-slate-600 font-mono">Strike · Expiry</div>
                        <div className="font-bold text-white font-mono">${r.strike}</div>
                        <div className={`text-xs font-mono font-bold ${dteColor(r.dte)}`}>
                          {r.expiration} · {r.dte}d
                        </div>
                      </div>

                      {/* Cost per contract */}
                      <div className="col-span-6 sm:col-span-2 space-y-0.5">
                        <div className="text-[10px] uppercase tracking-widest text-slate-600 font-mono">Cost / Contract</div>
                        <div className="text-emerald-400 font-bold text-lg font-mono leading-none">${r.costPerContract}</div>
                        <div className="text-[10px] text-slate-500 font-mono">
                          Can buy {r.contractsAffordable}× · ask ${r.ask}
                        </div>
                      </div>

                      {/* Break-even */}
                      <div className="col-span-6 sm:col-span-2 space-y-0.5">
                        <div className="text-[10px] uppercase tracking-widest text-slate-600 font-mono">Break-even</div>
                        <div className="text-white font-bold font-mono">${r.breakeven}</div>
                        <div className={`text-xs font-mono font-bold ${r.breakevenPct > 15 ? "text-red-400" : r.breakevenPct > 7 ? "text-amber-400" : "text-emerald-400"}`}>
                          +{r.breakevenPct.toFixed(1)}% needed
                        </div>
                      </div>

                      {/* Score + risk + metrics */}
                      <div className="col-span-6 sm:col-span-3 flex flex-col gap-2">
                        {/* Score bar */}
                        <div className="flex items-center gap-2">
                          <div className="flex-1 h-1.5 bg-white/5 rounded-full overflow-hidden">
                            <div
                              className={`h-full rounded-full ${r.scorePercent >= 70 ? "bg-emerald-500" : r.scorePercent >= 45 ? "bg-amber-500" : "bg-red-500"}`}
                              style={{ width: `${r.scorePercent}%`, transition: "width 0.5s ease" }}
                            />
                          </div>
                          <span className={`text-xs font-bold font-mono tabular-nums ${scoreColor(r.scorePercent)}`}>
                            {r.scorePercent}
                          </span>
                        </div>
                        {/* Tags */}
                        <div className="flex flex-wrap gap-1">
                          <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded border font-mono uppercase tracking-wider ${risk.color}`}>
                            {risk.label}
                          </span>
                          {r.tags.slice(0, 2).map((tag) => (
                            <span key={tag} className="text-[9px] font-bold px-1.5 py-0.5 rounded border border-white/10 bg-white/5 text-slate-400 font-mono uppercase tracking-wider">
                              {tag}
                            </span>
                          ))}
                        </div>
                        {/* Volume / IV */}
                        <div className="flex gap-3 text-[10px] font-mono text-slate-500">
                          <span>Vol <span className="text-slate-300">{r.volume.toLocaleString()}</span></span>
                          <span>OI <span className="text-slate-300">{r.openInterest.toLocaleString()}</span></span>
                          <span>IV <span className={r.impliedVolatility > 100 ? "text-red-400" : r.impliedVolatility > 60 ? "text-amber-400" : "text-slate-300"}>{r.impliedVolatility}%</span></span>
                        </div>
                      </div>

                    </div>
                  </div>
                );
              })}
            </div>

            {/* Footer disclaimer */}
            <p className="text-[10px] text-slate-700 font-mono text-center pt-2 uppercase tracking-widest">
              For educational purposes only · not financial advice · options carry significant risk of total loss
            </p>
          </div>
        )}
      </div>
    </Layout>
  );
}
