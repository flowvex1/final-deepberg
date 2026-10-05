import { useState } from "react";
import { useParams, useLocation } from "wouter";
import { useGetOptionsFlow, getGetOptionsFlowQueryKey, useAnalyzeOptionsFlow, useGetOptionsFlowHistory } from "@workspace/api-client-react";
import type { OptionContract } from "@workspace/api-client-react";
import { Layout } from "@/components/layout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import {
  ArrowRight,
  Flame,
  TrendingUp,
  TrendingDown,
  Zap,
  AlertTriangle,
  BarChart3,
  Activity,
  Brain,
  ChevronRight,
  Loader2,
  History,
  Star,
} from "lucide-react";
import {
  ComposedChart,
  Line,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
  ReferenceLine,
} from "recharts";

function fmt(n: number, decimals = 2) {
  return n.toFixed(decimals);
}

function fmtPremium(n: number) {
  if (n >= 1_000_000) return `$${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `$${(n / 1_000).toFixed(0)}K`;
  return `$${n.toFixed(0)}`;
}

function fmtVol(n: number) {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(0)}K`;
  return String(n);
}

function scoreCall(c: OptionContract, currentPrice: number): { score: number; tags: string[] } {
  let score = 0;
  const tags: string[] = [];
  const dist = Math.abs(c.strike - currentPrice) / currentPrice;
  const iv = c.impliedVolatility;
  const spread = c.ask > 0 ? (c.ask - c.bid) / c.ask : 1;
  const costPerContract = c.ask * 100;

  if (dist <= 0.02) { score += 3; tags.push("Near ATM"); }
  else if (dist <= 0.05) { score += 2; tags.push("Near ATM"); }
  else if (dist <= 0.10) { score += 1; }

  if (c.unusualScore >= 5) { score += 3; tags.push("High Flow"); }
  else if (c.unusualScore >= 3) { score += 2; tags.push("High Flow"); }
  else if (c.unusualScore >= 1.5) { score += 1; }

  if (iv < 0.30) { score += 2; tags.push("Low IV"); }
  else if (iv < 0.60) { score += 1; }
  else if (iv > 1.0) { score -= 1; tags.push("High IV"); }

  if (spread < 0.05) { score += 2; tags.push("Tight Spread"); }
  else if (spread < 0.15) { score += 1; }
  else if (spread > 0.40) { score -= 1; }

  if (c.volume >= 1000) { score += 2; tags.push("Heavy Volume"); }
  else if (c.volume >= 200) { score += 1; }
  else if (c.volume < 50) { score -= 1; }

  if (costPerContract > 0 && costPerContract <= 300) { score += 2; tags.push("Cheap Entry"); }
  else if (costPerContract <= 700) { score += 1; }

  if (!c.inTheMoney) { score += 1; }

  return { score: Math.max(0, score), tags };
}

const MAX_CALL_SCORE = 14;

function GoodCallsPicker({ calls, currentPrice }: { calls: OptionContract[]; currentPrice: number }) {
  const scored = calls
    .filter((c) => c.ask > 0 && c.volume >= 10)
    .map((c) => ({ c, ...scoreCall(c, currentPrice) }))
    .sort((a, b) => b.score - a.score)
    .slice(0, 5);

  if (scored.length === 0) return null;

  return (
    <Card className="border-emerald-500/25 bg-emerald-950/10">
      <CardHeader className="pb-3">
        <CardTitle className="text-base flex items-center gap-2 text-emerald-300">
          <Star className="h-4 w-4 fill-emerald-400 text-emerald-400" />
          Best Calls to Buy
          <span className="text-xs font-normal text-muted-foreground ml-1">
            — scored by IV, premium, spread, flow &amp; distance to strike
          </span>
        </CardTitle>
      </CardHeader>
      <CardContent className="p-0">
        <div className="divide-y divide-border/30">
          {scored.map(({ c, score, tags }, i) => {
            const pct = Math.round((score / MAX_CALL_SCORE) * 100);
            const barColor = pct >= 70 ? "bg-emerald-500" : pct >= 45 ? "bg-amber-500" : "bg-muted-foreground";
            const distPct = ((c.strike - currentPrice) / currentPrice * 100).toFixed(1);
            const costPerContract = c.ask * 100;
            return (
              <div key={c.contractSymbol} className="px-5 py-3.5 flex items-center gap-4">
                <span className="text-lg font-bold font-mono text-muted-foreground/40 w-4 shrink-0">#{i + 1}</span>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1 flex-wrap">
                    <span className="font-mono font-bold text-emerald-300 text-sm">${fmt(c.strike)} CALL</span>
                    <span className="text-xs text-muted-foreground font-mono">{c.expiration}</span>
                    <span className={`text-xs font-mono ${Number(distPct) >= 0 ? "text-amber-400" : "text-red-400"}`}>
                      {Number(distPct) >= 0 ? "+" : ""}{distPct}% from price
                    </span>
                  </div>
                  <div className="flex items-center gap-2 flex-wrap">
                    {tags.slice(0, 4).map((tag) => (
                      <span key={tag} className="px-1.5 py-0.5 rounded text-[10px] font-semibold bg-emerald-500/15 text-emerald-400 border border-emerald-500/20">
                        {tag}
                      </span>
                    ))}
                  </div>
                  <div className="mt-2 flex items-center gap-2">
                    <div className="flex-1 h-1.5 rounded-full bg-muted overflow-hidden max-w-[120px]">
                      <div className={`h-full rounded-full ${barColor} transition-all`} style={{ width: `${pct}%` }} />
                    </div>
                    <span className="text-[10px] text-muted-foreground font-mono">{pct}% score</span>
                  </div>
                </div>
                <div className="text-right shrink-0 space-y-0.5">
                  <div className="font-mono font-bold text-sm text-foreground">
                    {costPerContract < 1000
                      ? `$${costPerContract.toFixed(0)}/contract`
                      : `$${(costPerContract / 1000).toFixed(1)}K/contract`}
                  </div>
                  <div className="text-xs text-muted-foreground font-mono">
                    IV {fmt(c.impliedVolatility * 100)}%
                    &nbsp;·&nbsp;
                    Vol {fmtVol(c.volume)}
                  </div>
                  <div className="text-xs text-muted-foreground font-mono">
                    Bid {fmt(c.bid)} / Ask {fmt(c.ask)}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
        <div className="px-5 py-2.5 border-t border-border/30">
          <p className="text-[11px] text-muted-foreground">
            Score considers: distance to strike · options flow (Vol/OI) · implied volatility · bid-ask spread · volume · premium cost. Not financial advice.
          </p>
        </div>
      </CardContent>
    </Card>
  );
}

function FlowHistoryChart({ symbol }: { symbol: string }) {
  const { data, isLoading } = useGetOptionsFlowHistory(symbol, { days: 30 });

  if (isLoading) {
    return (
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            <History className="h-4 w-4 text-blue-400" />
            30-Day Flow History
          </CardTitle>
        </CardHeader>
        <CardContent>
          <Skeleton className="h-52 w-full" />
        </CardContent>
      </Card>
    );
  }

  if (!data || data.length === 0) {
    return (
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            <History className="h-4 w-4 text-blue-400" />
            30-Day Flow History
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="h-44 flex flex-col items-center justify-center text-center gap-2 text-muted-foreground text-sm">
            <History className="h-8 w-8 opacity-30" />
            <p>History builds automatically as you load this page over time.</p>
            <p className="text-xs">Today's snapshot was just recorded — come back tomorrow for a trend.</p>
          </div>
        </CardContent>
      </Card>
    );
  }

  const chartData = data.map((row) => ({
    date: row.date.slice(5),
    "P/C Ratio": Number(row.putCallRatio.toFixed(3)),
    "Call Premium ($M)": Number((row.callPremium / 1_000_000).toFixed(2)),
    "Put Premium ($M)": Number((row.putPremium / 1_000_000).toFixed(2)),
    price: Number(row.currentPrice.toFixed(2)),
  }));

  return (
    <Card>
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between">
          <CardTitle className="text-base flex items-center gap-2">
            <History className="h-4 w-4 text-blue-400" />
            30-Day Flow History
            <span className="text-xs font-normal text-muted-foreground ml-1">
              — {data.length} snapshots
            </span>
          </CardTitle>
          <span className="text-xs text-muted-foreground font-mono">
            P/C Ratio · Call/Put Premium
          </span>
        </div>
      </CardHeader>
      <CardContent className="pt-0 pb-4">
        <ResponsiveContainer width="100%" height={220}>
          <ComposedChart data={chartData} margin={{ top: 8, right: 16, left: 0, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" opacity={0.4} />
            <XAxis
              dataKey="date"
              tick={{ fontSize: 10, fill: "hsl(var(--muted-foreground))" }}
              tickLine={false}
              axisLine={false}
            />
            <YAxis
              yAxisId="pc"
              orientation="left"
              tick={{ fontSize: 10, fill: "hsl(var(--muted-foreground))" }}
              tickLine={false}
              axisLine={false}
              domain={[0, "auto"]}
              tickFormatter={(v) => v.toFixed(1)}
            />
            <YAxis
              yAxisId="prem"
              orientation="right"
              tick={{ fontSize: 10, fill: "hsl(var(--muted-foreground))" }}
              tickLine={false}
              axisLine={false}
              tickFormatter={(v) => `$${v}M`}
            />
            <Tooltip
              contentStyle={{
                background: "hsl(var(--card))",
                border: "1px solid hsl(var(--border))",
                borderRadius: "6px",
                fontSize: "12px",
              }}
              labelStyle={{ color: "hsl(var(--muted-foreground))", marginBottom: 4 }}
            />
            <Legend
              wrapperStyle={{ fontSize: 11, paddingTop: 8 }}
              iconType="line"
            />
            <ReferenceLine yAxisId="pc" y={1} stroke="#f59e0b" strokeDasharray="4 2" opacity={0.6} />
            <Bar yAxisId="prem" dataKey="Call Premium ($M)" fill="#22c55e" opacity={0.5} radius={[2, 2, 0, 0]} />
            <Bar yAxisId="prem" dataKey="Put Premium ($M)" fill="#ef4444" opacity={0.5} radius={[2, 2, 0, 0]} />
            <Line
              yAxisId="pc"
              type="monotone"
              dataKey="P/C Ratio"
              stroke="#60a5fa"
              strokeWidth={2}
              dot={{ r: 3, fill: "#60a5fa" }}
              activeDot={{ r: 5 }}
            />
          </ComposedChart>
        </ResponsiveContainer>
        <p className="text-xs text-muted-foreground mt-1 text-center">
          Dashed line = P/C ratio of 1.0 (neutral). Above = bearish flow, below = bullish flow.
        </p>
      </CardContent>
    </Card>
  );
}

function PutCallGauge({ ratio }: { ratio: number }) {
  const pct = Math.min((ratio / 3) * 100, 100);
  const color = ratio > 1.5 ? "#ef4444" : ratio > 0.8 ? "#f59e0b" : "#22c55e";
  const label = ratio > 1.5 ? "BEARISH FLOW" : ratio > 0.8 ? "NEUTRAL" : "BULLISH FLOW";

  return (
    <div className="flex flex-col gap-2">
      <div className="flex justify-between items-end">
        <span className="text-xs text-muted-foreground uppercase tracking-wider">Put/Call Ratio</span>
        <span className="text-2xl font-bold font-mono" style={{ color }}>{fmt(ratio)}</span>
      </div>
      <div className="w-full h-2 rounded-full bg-muted overflow-hidden">
        <div
          className="h-full rounded-full transition-all duration-500"
          style={{ width: `${pct}%`, backgroundColor: color }}
        />
      </div>
      <div className="flex justify-between text-xs text-muted-foreground">
        <span className="text-emerald-500 font-mono">CALLS</span>
        <span className="font-semibold" style={{ color }}>{label}</span>
        <span className="text-red-500 font-mono">PUTS</span>
      </div>
    </div>
  );
}

function UnusualRow({ contract, rank }: { contract: OptionContract; rank: number }) {
  const isCall = contract.type === "call";
  const isITM = contract.inTheMoney;
  const scoreColor =
    contract.unusualScore > 10 ? "text-red-400" :
    contract.unusualScore > 5 ? "text-amber-400" : "text-emerald-400";

  return (
    <tr className="border-b border-border/40 hover:bg-accent/30 transition-colors">
      <td className="px-3 py-2.5 text-xs text-muted-foreground font-mono">{rank}</td>
      <td className="px-3 py-2.5">
        <div className="flex items-center gap-2">
          <Badge
            variant="outline"
            className={`text-xs font-bold px-1.5 py-0 ${
              isCall
                ? "border-emerald-500/50 text-emerald-400 bg-emerald-500/10"
                : "border-red-500/50 text-red-400 bg-red-500/10"
            }`}
          >
            {contract.type.toUpperCase()}
          </Badge>
          {isITM && (
            <Badge variant="secondary" className="text-xs px-1.5 py-0 bg-primary/10 text-primary">ITM</Badge>
          )}
        </div>
      </td>
      <td className="px-3 py-2.5 font-mono font-bold text-sm">${fmt(contract.strike)}</td>
      <td className="px-3 py-2.5 text-xs font-mono text-muted-foreground">{contract.expiration}</td>
      <td className="px-3 py-2.5 font-mono text-sm">{fmtVol(contract.volume)}</td>
      <td className="px-3 py-2.5 font-mono text-sm text-muted-foreground">{fmtVol(contract.openInterest)}</td>
      <td className={`px-3 py-2.5 font-mono text-sm font-bold ${scoreColor}`}>
        {contract.unusualScore > 90 ? "∞" : fmt(contract.unusualScore, 1)}x
      </td>
      <td className="px-3 py-2.5 font-mono text-sm">{fmt(contract.impliedVolatility * 100)}%</td>
      <td className="px-3 py-2.5 font-mono text-sm font-semibold text-primary">
        {fmtPremium(contract.estimatedPremium)}
      </td>
    </tr>
  );
}

function ChainRow({ contract }: { contract: OptionContract }) {
  const isITM = contract.inTheMoney;
  const isPositive = contract.change >= 0;

  return (
    <tr
      className={`border-b border-border/30 hover:bg-accent/20 transition-colors text-sm ${
        isITM ? "bg-primary/5" : ""
      }`}
    >
      <td className="px-3 py-2 font-mono">${fmt(contract.strike)}</td>
      <td className="px-3 py-2 font-mono">{fmt(contract.lastPrice)}</td>
      <td className="px-3 py-2 font-mono text-muted-foreground">{fmt(contract.bid)} / {fmt(contract.ask)}</td>
      <td className={`px-3 py-2 font-mono text-xs ${isPositive ? "text-emerald-400" : "text-red-400"}`}>
        {isPositive ? "+" : ""}{fmt(contract.changePercent)}%
      </td>
      <td className="px-3 py-2 font-mono font-semibold">{fmtVol(contract.volume)}</td>
      <td className="px-3 py-2 font-mono text-muted-foreground">{fmtVol(contract.openInterest)}</td>
      <td className="px-3 py-2 font-mono">{fmt(contract.impliedVolatility * 100)}%</td>
      {isITM && <td className="px-3 py-2"><Badge variant="secondary" className="text-xs px-1 py-0 bg-primary/10 text-primary">ITM</Badge></td>}
      {!isITM && <td className="px-3 py-2" />}
    </tr>
  );
}

function TickerInput({ initial }: { initial?: string }) {
  const [value, setValue] = useState(initial || "");
  const [, setLocation] = useLocation();

  const go = () => {
    const t = value.trim().toUpperCase();
    if (t) setLocation(`/options/${t}`);
  };

  return (
    <div className="flex gap-2 items-center">
      <div className="relative">
        <input
          type="text"
          value={value}
          onChange={(e) => setValue(e.target.value.toUpperCase())}
          onKeyDown={(e) => e.key === "Enter" && go()}
          placeholder="Enter ticker..."
          className="w-44 px-3 py-2 h-10 rounded-md border border-border bg-card text-sm font-mono shadow-sm focus:outline-none focus:ring-2 focus:ring-primary/50 placeholder:text-muted-foreground/60 uppercase"
          spellCheck={false}
          autoComplete="off"
        />
      </div>
      <button
        onClick={go}
        className="h-10 px-4 rounded-md bg-primary text-primary-foreground text-sm font-mono font-semibold hover:bg-primary/90 transition-colors flex items-center gap-1.5 shadow-lg shadow-primary/20"
      >
        <Activity className="h-4 w-4" />
        Load Flow
      </button>
    </div>
  );
}

function MetricCard({ label, value, sub, icon: Icon, color }: {
  label: string; value: string; sub?: string; icon: any; color?: string;
}) {
  return (
    <Card>
      <CardContent className="p-4">
        <div className="flex justify-between items-start mb-1">
          <span className="text-xs text-muted-foreground uppercase tracking-wider">{label}</span>
          <Icon className={`h-4 w-4 ${color || "text-muted-foreground"}`} />
        </div>
        <div className={`text-xl font-bold font-mono ${color || ""}`}>{value}</div>
        {sub && <div className="text-xs text-muted-foreground mt-0.5">{sub}</div>}
      </CardContent>
    </Card>
  );
}

export function OptionsFlow() {
  const { symbol } = useParams<{ symbol?: string }>();
  const [chainTab, setChainTab] = useState<"calls" | "puts">("calls");
  const [, setLocation] = useLocation();
  const { mutate: runAnalysis, data: aiData, isPending: isAnalyzing, isError: isAnalysisError, reset: resetAnalysis } = useAnalyzeOptionsFlow();

  const { data, isLoading, isError } = useGetOptionsFlow(
    symbol || "",
    undefined,
    {
      query: {
        enabled: !!symbol,
        queryKey: getGetOptionsFlowQueryKey(symbol || ""),
        retry: 1,
      },
    }
  );

  const [selectedExp, setSelectedExp] = useState<string | undefined>(undefined);
  const effectiveExp = selectedExp || data?.selectedExpiration;

  const { data: expData, isLoading: isLoadingExp } = useGetOptionsFlow(
    symbol || "",
    effectiveExp && effectiveExp !== data?.selectedExpiration
      ? { expiration: effectiveExp }
      : undefined,
    {
      query: {
        enabled: !!symbol && !!effectiveExp && effectiveExp !== data?.selectedExpiration,
        queryKey: getGetOptionsFlowQueryKey(symbol || "", effectiveExp && effectiveExp !== data?.selectedExpiration ? { expiration: effectiveExp } : undefined),
      },
    }
  );

  const flow = expData || data;
  const isLoadingChain = isLoading || isLoadingExp;

  return (
    <Layout>
      <div className="space-y-6">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <h1 className="text-3xl font-bold tracking-tight flex items-center gap-3">
              <Flame className="h-7 w-7 text-orange-400" />
              Options Flow
            </h1>
            <p className="text-muted-foreground mt-1">
              Live options chain · unusual activity · put/call ratio
            </p>
          </div>
          <TickerInput initial={symbol} />
        </div>

        {!symbol && (
          <div className="flex flex-col items-center justify-center py-24 gap-4 text-center">
            <Flame className="h-16 w-16 text-orange-400/30" />
            <h2 className="text-xl font-semibold text-muted-foreground">Enter a ticker to load its options flow</h2>
            <p className="text-muted-foreground text-sm max-w-sm">
              See the put/call ratio, unusual activity, and full options chain for any optionable stock.
            </p>
            <div className="flex gap-2 flex-wrap justify-center mt-2">
              {["AAPL", "TSLA", "NVDA", "SPY", "QQQ", "AMD"].map((t) => (
                <button
                  key={t}
                  onClick={() => setLocation(`/options/${t}`)}
                  className="px-3 py-1.5 rounded border border-border bg-card text-sm font-mono hover:border-primary hover:text-primary transition-colors"
                >
                  {t}
                </button>
              ))}
            </div>
          </div>
        )}

        {symbol && isLoading && (
          <div className="space-y-4">
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
              {[...Array(4)].map((_, i) => (
                <Card key={i}><CardContent className="p-4"><Skeleton className="h-10 w-full" /></CardContent></Card>
              ))}
            </div>
            <Card><CardContent className="p-6"><Skeleton className="h-48 w-full" /></CardContent></Card>
          </div>
        )}

        {symbol && isError && (
          <div className="flex flex-col items-center justify-center py-20 gap-3 text-center">
            <AlertTriangle className="h-12 w-12 text-destructive/50" />
            <h2 className="text-lg font-semibold">No options data for <span className="text-primary font-mono">{symbol}</span></h2>
            <p className="text-muted-foreground text-sm">This symbol may not be optionable or the market may be closed.</p>
          </div>
        )}

        {symbol && flow && !isLoading && (
          <>
            <div className="flex items-center gap-3 flex-wrap">
              <span className="text-4xl font-bold font-mono text-primary">{symbol}</span>
              <Badge variant="outline" className="font-mono text-base px-3 py-1">
                ${fmt(flow.currentPrice)}
              </Badge>
              <button
                onClick={() => { resetAnalysis(); runAnalysis({ symbol }); }}
                disabled={isAnalyzing}
                className="flex items-center gap-2 px-4 py-2 rounded-md border border-violet-500/40 bg-violet-500/10 text-violet-300 text-sm font-mono font-semibold hover:bg-violet-500/20 hover:border-violet-400/60 transition-colors disabled:opacity-60 shadow-sm"
              >
                {isAnalyzing ? (
                  <><Loader2 className="h-4 w-4 animate-spin" />Analyzing…</>
                ) : (
                  <><Brain className="h-4 w-4" />AI Analyze Flow</>
                )}
              </button>
              <div className="flex gap-2 ml-auto flex-wrap">
                {flow.expirationDates.slice(0, 8).map((date) => (
                  <button
                    key={date}
                    onClick={() => setSelectedExp(date)}
                    className={`px-3 py-1 rounded text-xs font-mono border transition-colors ${
                      (effectiveExp === date)
                        ? "border-primary text-primary bg-primary/10"
                        : "border-border text-muted-foreground hover:border-primary/50"
                    }`}
                  >
                    {date}
                  </button>
                ))}
              </div>
            </div>

            <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
              <Card className="col-span-2 lg:col-span-1">
                <CardContent className="p-4">
                  <PutCallGauge ratio={flow.putCallRatio} />
                </CardContent>
              </Card>

              <MetricCard
                label="Call Volume"
                value={fmtVol(flow.totalCallVolume)}
                sub={`Premium: ${fmtPremium(flow.callPremium)}`}
                icon={TrendingUp}
                color="text-emerald-400"
              />
              <MetricCard
                label="Put Volume"
                value={fmtVol(flow.totalPutVolume)}
                sub={`Premium: ${fmtPremium(flow.putPremium)}`}
                icon={TrendingDown}
                color="text-red-400"
              />
              <MetricCard
                label="Unusual Alerts"
                value={String(flow.unusualActivity.length)}
                sub="Volume >> Open Interest"
                icon={Zap}
                color="text-amber-400"
              />
            </div>

            <GoodCallsPicker calls={flow.calls} currentPrice={flow.currentPrice} />

            {(isAnalyzing || aiData || isAnalysisError) && (
              <Card className="border-violet-500/30 bg-violet-950/20">
                <CardHeader className="pb-3">
                  <CardTitle className="text-base flex items-center gap-2 text-violet-300">
                    <Brain className="h-4 w-4" />
                    AI Flow Analysis
                    {aiData && (
                      <Badge
                        className={`ml-2 text-xs font-mono ${
                          aiData.sentiment === "bullish"
                            ? "bg-emerald-500/20 text-emerald-300 border-emerald-500/30"
                            : aiData.sentiment === "bearish"
                            ? "bg-red-500/20 text-red-300 border-red-500/30"
                            : "bg-amber-500/20 text-amber-300 border-amber-500/30"
                        }`}
                        variant="outline"
                      >
                        {aiData.sentiment.toUpperCase()}
                      </Badge>
                    )}
                    {aiData?.momentumSignal && (
                      <span className="ml-auto text-xs text-muted-foreground font-normal">
                        Signal: <span className="text-violet-300 font-mono">{aiData.momentumSignal}</span>
                      </span>
                    )}
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  {isAnalyzing && (
                    <div className="flex items-center gap-3 text-muted-foreground text-sm py-4">
                      <Loader2 className="h-5 w-5 animate-spin text-violet-400" />
                      Analyzing options flow with AI…
                    </div>
                  )}
                  {isAnalysisError && (
                    <div className="flex items-center gap-2 text-red-400 text-sm">
                      <AlertTriangle className="h-4 w-4" />
                      Analysis failed. Check that OpenAI is configured and try again.
                    </div>
                  )}
                  {aiData && (
                    <div className="space-y-4">
                      <div className="rounded-md bg-background/60 border border-border p-4">
                        <p className="text-xs uppercase tracking-wider text-muted-foreground mb-2">Summary</p>
                        <p className="text-sm leading-relaxed">{aiData.unusualSummary}</p>
                      </div>

                      {aiData.keyBlocks && aiData.keyBlocks.length > 0 && (
                        <div>
                          <p className="text-xs uppercase tracking-wider text-muted-foreground mb-2">Key Blocks</p>
                          <div className="space-y-1.5">
                            {aiData.keyBlocks.map((block: string, i: number) => (
                              <div key={i} className="flex items-start gap-2 text-sm">
                                <ChevronRight className="h-4 w-4 text-violet-400 mt-0.5 shrink-0" />
                                <span>{block}</span>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}

                      {aiData.recommendation && (
                        <div className="rounded-md bg-violet-500/10 border border-violet-500/20 p-3 text-sm text-violet-200">
                          <span className="font-semibold text-violet-300">Recommendation: </span>
                          {aiData.recommendation}
                        </div>
                      )}
                    </div>
                  )}
                </CardContent>
              </Card>
            )}

            {flow.unusualActivity.length > 0 && (
              <Card>
                <CardHeader className="pb-3">
                  <CardTitle className="text-base flex items-center gap-2">
                    <Zap className="h-4 w-4 text-amber-400" />
                    Unusual Activity
                    <Badge variant="outline" className="ml-2 text-xs text-amber-400 border-amber-500/30">
                      {flow.unusualActivity.length} alerts
                    </Badge>
                  </CardTitle>
                </CardHeader>
                <CardContent className="p-0">
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="border-b border-border text-xs text-muted-foreground uppercase tracking-wider">
                          <th className="px-3 py-2 text-left w-8">#</th>
                          <th className="px-3 py-2 text-left">Type</th>
                          <th className="px-3 py-2 text-left">Strike</th>
                          <th className="px-3 py-2 text-left">Exp</th>
                          <th className="px-3 py-2 text-left">Volume</th>
                          <th className="px-3 py-2 text-left">OI</th>
                          <th className="px-3 py-2 text-left">Vol/OI</th>
                          <th className="px-3 py-2 text-left">IV</th>
                          <th className="px-3 py-2 text-left">Premium</th>
                        </tr>
                      </thead>
                      <tbody>
                        {flow.unusualActivity.map((c, i) => (
                          <UnusualRow key={c.contractSymbol} contract={c} rank={i + 1} />
                        ))}
                      </tbody>
                    </table>
                  </div>
                </CardContent>
              </Card>
            )}

            <FlowHistoryChart symbol={symbol} />

            <Card>
              <CardHeader className="pb-0">
                <div className="flex items-center justify-between">
                  <CardTitle className="text-base flex items-center gap-2">
                    <BarChart3 className="h-4 w-4" />
                    Options Chain
                    <span className="text-muted-foreground font-normal text-sm ml-1">
                      — {effectiveExp}
                    </span>
                  </CardTitle>
                  <div className="flex rounded-md border border-border overflow-hidden text-xs font-mono">
                    <button
                      onClick={() => setChainTab("calls")}
                      className={`px-4 py-1.5 transition-colors ${
                        chainTab === "calls"
                          ? "bg-emerald-500/20 text-emerald-400 border-r border-border"
                          : "text-muted-foreground hover:bg-accent border-r border-border"
                      }`}
                    >
                      CALLS ({flow.calls.length})
                    </button>
                    <button
                      onClick={() => setChainTab("puts")}
                      className={`px-4 py-1.5 transition-colors ${
                        chainTab === "puts"
                          ? "bg-red-500/20 text-red-400"
                          : "text-muted-foreground hover:bg-accent"
                      }`}
                    >
                      PUTS ({flow.puts.length})
                    </button>
                  </div>
                </div>
              </CardHeader>
              <CardContent className="p-0 mt-3">
                {isLoadingChain ? (
                  <div className="p-6 space-y-2">
                    {[...Array(8)].map((_, i) => <Skeleton key={i} className="h-8 w-full" />)}
                  </div>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="border-b border-border text-xs text-muted-foreground uppercase tracking-wider">
                          <th className="px-3 py-2 text-left">Strike</th>
                          <th className="px-3 py-2 text-left">Last</th>
                          <th className="px-3 py-2 text-left">Bid / Ask</th>
                          <th className="px-3 py-2 text-left">Chg%</th>
                          <th className="px-3 py-2 text-left">Volume</th>
                          <th className="px-3 py-2 text-left">OI</th>
                          <th className="px-3 py-2 text-left">IV</th>
                          <th className="px-3 py-2 text-left" />
                        </tr>
                      </thead>
                      <tbody>
                        {(chainTab === "calls" ? flow.calls : flow.puts).map((c) => (
                          <ChainRow key={c.contractSymbol} contract={c} />
                        ))}
                      </tbody>
                    </table>
                    {(chainTab === "calls" ? flow.calls : flow.puts).length === 0 && (
                      <div className="p-8 text-center text-muted-foreground text-sm">No contracts available</div>
                    )}
                  </div>
                )}
              </CardContent>
            </Card>
          </>
        )}
      </div>
    </Layout>
  );
}
