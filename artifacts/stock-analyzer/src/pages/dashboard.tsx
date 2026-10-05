import { useState } from "react";
import { useLocation, Link } from "wouter";
import {
  useGetIVRadar, getGetIVRadarQueryKey,
  useGetOptionsFlow, getGetOptionsFlowQueryKey,
  useGetOptionsTopPicks, getGetOptionsTopPicksQueryKey,
} from "@workspace/api-client-react";
import type { TopOptionPick } from "@workspace/api-client-react";
import { Layout } from "@/components/layout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { useAlerts, type AlertType } from "@/hooks/use-alerts";
import { formatDistanceToNow } from "date-fns";
import {
  Flame, BarChart2, Bell, TrendingUp, TrendingDown, Zap,
  ExternalLink, ChevronUp, ChevronDown, ArrowRight,
  Star, RefreshCw, ArrowUpRight, ArrowDownRight,
} from "lucide-react";
import { MarketRegimeBanner } from "@/components/market-regime-banner";

const ALERT_ICONS: Record<AlertType, { icon: any; color: string }> = {
  volume:         { icon: Flame,         color: "text-orange-400" },
  price_up:       { icon: TrendingUp,    color: "text-emerald-400" },
  price_down:     { icon: TrendingDown,  color: "text-red-400" },
  breakout52h:    { icon: ChevronUp,     color: "text-blue-400" },
  breakdown52l:   { icon: ChevronDown,   color: "text-purple-400" },
  day_high_break: { icon: ArrowUpRight,  color: "text-cyan-400" },
  gap_up:         { icon: ArrowUpRight,  color: "text-lime-400" },
  gap_down:       { icon: ArrowDownRight,color: "text-rose-400" },
};

function IVRankMini({ rank }: { rank: number }) {
  const color = rank >= 70 ? "bg-red-500" : rank >= 40 ? "bg-amber-500" : "bg-emerald-500";
  const text  = rank >= 70 ? "text-red-400"  : rank >= 40 ? "text-amber-400"  : "text-emerald-400";
  return (
    <div className="flex items-center gap-1.5">
      <div className="w-16 h-1 rounded-full bg-muted overflow-hidden">
        <div className={`h-full rounded-full ${color}`} style={{ width: `${Math.min(rank, 100)}%` }} />
      </div>
      <span className={`text-xs font-mono font-bold ${text}`}>{rank}</span>
    </div>
  );
}

function FlowTicker() {
  const [, setLocation] = useLocation();
  const [ticker, setTicker] = useState("NVDA");
  const [input, setInput] = useState("NVDA");

  const { data: flow, isLoading, isError } = useGetOptionsFlow(
    ticker,
    undefined,
    { query: { queryKey: getGetOptionsFlowQueryKey(ticker), enabled: !!ticker } }
  );

  const go = () => { const t = input.trim().toUpperCase(); if (t) setTicker(t); };

  return (
    <Card className="h-full">
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between">
          <CardTitle className="text-sm flex items-center gap-2">
            <Flame className="h-4 w-4 text-orange-400" />
            Options Flow
          </CardTitle>
          <div className="flex items-center gap-1.5">
            <input
              type="text"
              value={input}
              onChange={(e) => setInput(e.target.value.toUpperCase())}
              onKeyDown={(e) => e.key === "Enter" && go()}
              className="w-20 px-2 py-1 h-7 rounded border border-border bg-background text-xs font-mono focus:outline-none focus:ring-1 focus:ring-primary"
            />
            <button onClick={go} className="h-7 px-2 rounded bg-primary/10 text-primary text-xs hover:bg-primary/20 transition-colors">Go</button>
          </div>
        </div>
      </CardHeader>
      <CardContent className="p-0">
        {isLoading ? (
          <div className="p-4 space-y-2">{[...Array(5)].map((_, i) => <Skeleton key={i} className="h-8 w-full" />)}</div>
        ) : isError ? (
          <p className="p-6 text-center text-xs text-red-300">Options flow is temporarily unavailable.</p>
        ) : flow ? (
          <>
            <div className="px-4 py-2 flex items-center justify-between border-b border-border/40">
              <div className="flex items-center gap-2">
                <span className="font-bold font-mono text-primary">{flow.symbol}</span>
                <span className="text-sm font-mono text-muted-foreground">${flow.currentPrice.toFixed(2)}</span>
              </div>
              <div className="flex items-center gap-3 text-xs font-mono">
                <span className="text-emerald-400">C: {(flow.totalCallVolume / 1000).toFixed(0)}K</span>
                <span className="text-red-400">P: {(flow.totalPutVolume / 1000).toFixed(0)}K</span>
                <span className={`font-bold ${flow.putCallRatio > 1 ? "text-red-400" : "text-emerald-400"}`}>
                  P/C: {flow.putCallRatio.toFixed(2)}
                </span>
              </div>
            </div>
            <div className="divide-y divide-border/30">
              {flow.unusualActivity.slice(0, 6).map((c) => (
                <div key={c.contractSymbol} className="px-4 py-2 flex items-center justify-between text-xs">
                  <div className="flex items-center gap-2">
                    <Badge variant="outline" className={`text-xs px-1.5 py-0 font-bold ${c.type === "call" ? "text-emerald-400 border-emerald-500/30" : "text-red-400 border-red-500/30"}`}>
                      {c.type.toUpperCase()}
                    </Badge>
                    <span className="font-mono font-semibold">${c.strike}</span>
                    <span className="text-muted-foreground font-mono">{c.expiration}</span>
                    {c.inTheMoney && <Badge variant="secondary" className="text-xs px-1 py-0 bg-primary/10 text-primary">ITM</Badge>}
                  </div>
                  <div className="flex items-center gap-3">
                    <span className="text-amber-400 font-mono font-bold">
                      {c.unusualScore > 90 ? "∞" : `${c.unusualScore.toFixed(1)}x`}
                    </span>
                    <span className="text-primary font-mono font-semibold">
                      {c.estimatedPremium >= 1e6
                        ? `$${(c.estimatedPremium / 1e6).toFixed(1)}M`
                        : `$${(c.estimatedPremium / 1e3).toFixed(0)}K`}
                    </span>
                  </div>
                </div>
              ))}
            </div>
            <div className="px-4 py-2 border-t border-border/40">
              <button onClick={() => setLocation(`/options/${flow.symbol}`)} className="text-xs text-primary hover:underline flex items-center gap-1">
                Full options chain <ArrowRight className="h-3 w-3" />
              </button>
            </div>
          </>
        ) : (
          <div className="p-6 text-center text-muted-foreground text-sm">Enter a ticker to see flow</div>
        )}
      </CardContent>
    </Card>
  );
}

function IVRadarMini() {
  const [, setLocation] = useLocation();
  const { data, isLoading, isError } = useGetIVRadar(
    {},
    { query: { queryKey: getGetIVRadarQueryKey({}), refetchInterval: 5 * 60 * 1000 } }
  );
  const sorted = data ? [...data].sort((a, b) => b.ivRank - a.ivRank) : [];

  return (
    <Card className="h-full">
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between">
          <CardTitle className="text-sm flex items-center gap-2">
            <BarChart2 className="h-4 w-4 text-blue-400" />
            IV Radar
          </CardTitle>
          <Link href="/iv-radar" className="text-xs text-muted-foreground hover:text-primary flex items-center gap-1">
            Full view <ExternalLink className="h-3 w-3" />
          </Link>
        </div>
      </CardHeader>
      <CardContent className="p-0">
        <div className="divide-y divide-border/30">
          {isError ? (
            <p className="p-6 text-center text-xs text-red-300">IV data is temporarily unavailable.</p>
          ) : isLoading
            ? [...Array(6)].map((_, i) => (
              <div key={i} className="px-4 py-2.5 flex items-center justify-between">
                <Skeleton className="h-4 w-12" />
                <Skeleton className="h-4 w-24" />
              </div>
            ))
            : sorted.slice(0, 8).map((d) => {
              const isPos = d.changePercent >= 0;
              return (
                <div
                  key={d.symbol}
                  onClick={() => setLocation(`/options/${d.symbol}`)}
                  className="px-4 py-2 flex items-center justify-between cursor-pointer hover:bg-accent/20 transition-colors"
                >
                  <div className="flex items-center gap-3">
                    <span className="font-mono font-bold text-sm text-primary w-12">{d.symbol}</span>
                    <span className={`text-xs font-mono ${isPos ? "text-emerald-400" : "text-red-400"}`}>
                      {isPos ? "+" : ""}{d.changePercent.toFixed(2)}%
                    </span>
                  </div>
                  <div className="flex items-center gap-3">
                    <span className="text-xs font-mono text-muted-foreground">{d.currentIV > 0 ? `IV ${d.currentIV.toFixed(0)}%` : ""}</span>
                    <IVRankMini rank={d.ivRank} />
                  </div>
                </div>
              );
            })}
        </div>
      </CardContent>
    </Card>
  );
}

function AlertsFeed() {
  const { alerts, unseenCount, markAllSeen } = useAlerts(60000);
  const recent = alerts.slice(0, 8);

  return (
    <Card className="h-full">
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between">
          <CardTitle className="text-sm flex items-center gap-2">
            <Bell className="h-4 w-4 text-yellow-400" />
            Smart Alerts
            {unseenCount > 0 && (
              <Badge className="bg-red-500 text-white text-xs px-1.5 py-0 font-mono">{unseenCount}</Badge>
            )}
          </CardTitle>
          <div className="flex items-center gap-2">
            {unseenCount > 0 && (
              <button onClick={markAllSeen} className="text-xs text-muted-foreground hover:text-primary transition-colors">Mark read</button>
            )}
            <Link href="/alerts" className="text-xs text-muted-foreground hover:text-primary flex items-center gap-1">
              Manage <ExternalLink className="h-3 w-3" />
            </Link>
          </div>
        </div>
      </CardHeader>
      <CardContent className="p-0">
        {recent.length === 0 ? (
          <div className="p-6 text-center">
            <Bell className="h-8 w-8 text-muted-foreground/20 mx-auto mb-2" />
            <p className="text-xs text-muted-foreground">No alerts yet — polling active.</p>
          </div>
        ) : (
          <div className="divide-y divide-border/30">
            {recent.map((alert) => {
              const cfg = ALERT_ICONS[alert.type] ?? { icon: Bell, color: "text-muted-foreground" };
              const Icon = cfg.icon;
              return (
                <div
                  key={alert.id}
                  className={`px-4 py-2.5 flex items-start gap-2.5 hover:bg-accent/20 transition-colors ${!alert.seen ? "border-l-2 border-primary" : ""}`}
                >
                  <Icon className={`h-3.5 w-3.5 mt-0.5 shrink-0 ${cfg.color}`} />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-1.5 mb-0.5">
                      <span className="font-mono font-bold text-xs text-primary">{alert.symbol}</span>
                      {!alert.seen && <div className="h-1.5 w-1.5 rounded-full bg-primary" />}
                    </div>
                    <p className="text-xs text-muted-foreground truncate">{alert.message}</p>
                  </div>
                  <span className="text-xs text-muted-foreground/60 shrink-0">
                    {formatDistanceToNow(alert.timestamp, { addSuffix: true })}
                  </span>
                </div>
              );
            })}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

const TAG_COLORS: Record<string, string> = {
  "Near ATM":     "bg-blue-500/15 text-blue-300",
  "High Flow":    "bg-orange-500/15 text-orange-300",
  "Low IV":       "bg-emerald-500/15 text-emerald-300",
  "High IV":      "bg-red-500/15 text-red-300",
  "Tight Spread": "bg-violet-500/15 text-violet-300",
  "Heavy Volume": "bg-amber-500/15 text-amber-300",
  "Cheap Entry":  "bg-cyan-500/15 text-cyan-300",
};

function RiskBadge({ risk }: { risk?: number }) {
  if (risk == null) return null;
  const cfg =
    risk >= 70 ? { label: "High Risk",  cls: "bg-red-500/20 text-red-300 border-red-500/40" } :
    risk >= 45 ? { label: "Med Risk",   cls: "bg-amber-500/20 text-amber-300 border-amber-500/40" } :
                 { label: "Low Risk",   cls: "bg-emerald-500/20 text-emerald-300 border-emerald-500/40" };
  return (
    <span className={`text-[9px] font-bold font-mono px-1.5 py-0.5 rounded border ${cfg.cls}`}>
      {cfg.label}
    </span>
  );
}

function PickRow({ pick, index }: { pick: TopOptionPick & { riskScore?: number }; index: number }) {
  const [, setLocation] = useLocation();
  const isCall = pick.type === "call";
  const oppColor = pick.scorePercent >= 70 ? "bg-emerald-500" : pick.scorePercent >= 45 ? "bg-amber-500" : "bg-muted-foreground";
  const riskColor = (pick.riskScore ?? 0) >= 70 ? "bg-red-500" : (pick.riskScore ?? 0) >= 45 ? "bg-amber-500" : "bg-emerald-500/60";

  return (
    <div
      onClick={() => setLocation(`/options/${pick.symbol}`)}
      className="px-4 py-3 flex items-center gap-3 hover:bg-accent/20 transition-colors cursor-pointer"
    >
      <span className="text-sm font-bold font-mono text-muted-foreground/40 w-4 shrink-0">#{index + 1}</span>

      <div className="flex flex-col gap-0.5 w-16 shrink-0">
        <span className="font-mono font-bold text-sm text-primary">{pick.symbol}</span>
        <Badge variant="outline" className={`text-[10px] px-1 py-0 w-fit font-bold ${isCall ? "text-emerald-400 border-emerald-500/30" : "text-red-400 border-red-500/30"}`}>
          {pick.type.toUpperCase()}
        </Badge>
      </div>

      <div className="flex flex-col gap-0.5 min-w-0 flex-1">
        <div className="flex items-center gap-2 text-xs font-mono">
          <span className="font-semibold">${pick.strike}</span>
          <span className="text-muted-foreground">{pick.expiration}</span>
          <span className={`text-xs ${pick.distancePct >= 0 ? "text-emerald-400" : "text-red-400"}`}>
            {pick.distancePct >= 0 ? "+" : ""}{pick.distancePct.toFixed(1)}%
          </span>
        </div>
        <div className="flex flex-wrap gap-1 items-center">
          {pick.tags.slice(0, 2).map((tag) => (
            <span key={tag} className={`text-[10px] px-1.5 py-0 rounded font-medium ${TAG_COLORS[tag] ?? "bg-muted text-muted-foreground"}`}>
              {tag}
            </span>
          ))}
          <RiskBadge risk={pick.riskScore} />
        </div>
      </div>

      <div className="flex flex-col items-end gap-1.5 shrink-0 w-24">
        {/* Opportunity bar */}
        <div className="flex items-center gap-1.5 w-full justify-end">
          <span className="text-[9px] text-muted-foreground font-mono w-5 text-right">OPP</span>
          <div className="w-12 h-1.5 rounded-full bg-muted overflow-hidden">
            <div className={`h-full rounded-full ${oppColor}`} style={{ width: `${pick.scorePercent}%` }} />
          </div>
          <span className="text-xs font-mono font-bold w-6 text-right text-foreground/80">{pick.scorePercent}</span>
        </div>
        {/* Risk bar */}
        {pick.riskScore != null && (
          <div className="flex items-center gap-1.5 w-full justify-end">
            <span className="text-[9px] text-muted-foreground font-mono w-5 text-right">RSK</span>
            <div className="w-12 h-1.5 rounded-full bg-muted overflow-hidden">
              <div className={`h-full rounded-full ${riskColor}`} style={{ width: `${pick.riskScore}%` }} />
            </div>
            <span className="text-xs font-mono font-bold w-6 text-right text-foreground/80">{pick.riskScore}</span>
          </div>
        )}
        <span className="text-xs font-mono text-muted-foreground">${pick.costPerContract}/c</span>
      </div>
    </div>
  );
}

function TopPicksSection() {
  const [tab, setTab] = useState<"calls" | "puts">("calls");
  const { data, isLoading, isError, refetch, isFetching } = useGetOptionsTopPicks({
    query: { queryKey: getGetOptionsTopPicksQueryKey(), staleTime: 10 * 60 * 1000 }
  });

  const picks = tab === "calls" ? (data?.calls ?? []) : (data?.puts ?? []);

  return (
    <Card className="border-primary/20">
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="text-base flex items-center gap-2">
            <Star className="h-4 w-4 fill-primary text-primary" />
            Strong Calls &amp; Puts
            <span className="text-xs font-normal text-muted-foreground">— top scored picks across NVDA · TSLA · AAPL · SPY · AMD · META · QQQ · MSFT</span>
          </CardTitle>
          <div className="flex items-center gap-2">
            {data?.generatedAt && (
              <span className="text-xs text-muted-foreground/60">
                {formatDistanceToNow(new Date(data.generatedAt), { addSuffix: true })}
              </span>
            )}
            <button
              onClick={() => refetch()}
              disabled={isFetching}
              className="h-6 w-6 flex items-center justify-center rounded hover:bg-accent/40 transition-colors text-muted-foreground hover:text-primary disabled:opacity-40"
            >
              <RefreshCw className={`h-3 w-3 ${isFetching ? "animate-spin" : ""}`} />
            </button>
          </div>
        </div>

        <div className="flex gap-1 mt-1">
          <button
            onClick={() => setTab("calls")}
            className={`px-3 py-1 rounded text-xs font-semibold transition-colors ${tab === "calls" ? "bg-emerald-500/20 text-emerald-300 border border-emerald-500/30" : "text-muted-foreground hover:text-foreground"}`}
          >
            Calls {data ? `(${data.calls.length})` : ""}
          </button>
          <button
            onClick={() => setTab("puts")}
            className={`px-3 py-1 rounded text-xs font-semibold transition-colors ${tab === "puts" ? "bg-red-500/20 text-red-300 border border-red-500/30" : "text-muted-foreground hover:text-foreground"}`}
          >
            Puts {data ? `(${data.puts.length})` : ""}
          </button>
        </div>
      </CardHeader>

      <CardContent className="p-0">
        {isLoading ? (
          <div className="divide-y divide-border/30">
            {[...Array(6)].map((_, i) => (
              <div key={i} className="px-4 py-3 flex items-center gap-3">
                <Skeleton className="h-4 w-4" />
                <Skeleton className="h-10 w-14" />
                <div className="flex-1 space-y-1.5">
                  <Skeleton className="h-3 w-40" />
                  <Skeleton className="h-3 w-28" />
                </div>
                <Skeleton className="h-6 w-20" />
              </div>
            ))}
          </div>
        ) : isError ? (
          <div className="p-8 text-center text-red-300 text-sm">Top picks are temporarily unavailable.</div>
        ) : picks.length > 0 ? (
          <div className="divide-y divide-border/30">
            {picks.map((pick, i) => <PickRow key={`${pick.symbol}-${pick.type}-${pick.strike}-${pick.expiration}`} pick={pick} index={i} />)}
          </div>
        ) : (
          <div className="p-8 text-center text-muted-foreground text-sm">No picks available — click refresh to load.</div>
        )}
      </CardContent>
    </Card>
  );
}

export function Dashboard() {
  return (
    <Layout>
      <div className="space-y-6">
        <div>
          <h1 className="text-3xl font-bold tracking-tight flex items-center gap-3">
            <Zap className="h-7 w-7 text-primary" />
            Trading Dashboard
          </h1>
          <p className="text-muted-foreground mt-1">Options flow · IV radar · smart alerts · top picks</p>
        </div>

        <MarketRegimeBanner />

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
          <div className="lg:col-span-1"><FlowTicker /></div>
          <div className="lg:col-span-1"><IVRadarMini /></div>
          <div className="lg:col-span-1"><AlertsFeed /></div>
        </div>

        <TopPicksSection />

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <Link href="/options">
            <Card className="hover:border-orange-500/50 hover:bg-orange-500/5 transition-colors cursor-pointer">
              <CardContent className="p-4 flex items-center gap-3">
                <Flame className="h-8 w-8 text-orange-400" />
                <div>
                  <div className="font-semibold text-sm">Options Flow</div>
                  <div className="text-xs text-muted-foreground">Full chain · unusual activity</div>
                </div>
                <ArrowRight className="h-4 w-4 text-muted-foreground ml-auto" />
              </CardContent>
            </Card>
          </Link>
          <Link href="/iv-radar">
            <Card className="hover:border-blue-500/50 hover:bg-blue-500/5 transition-colors cursor-pointer">
              <CardContent className="p-4 flex items-center gap-3">
                <BarChart2 className="h-8 w-8 text-blue-400" />
                <div>
                  <div className="font-semibold text-sm">IV Radar</div>
                  <div className="text-xs text-muted-foreground">IV rank · term structure · HV</div>
                </div>
                <ArrowRight className="h-4 w-4 text-muted-foreground ml-auto" />
              </CardContent>
            </Card>
          </Link>
          <Link href="/alerts">
            <Card className="hover:border-yellow-500/50 hover:bg-yellow-500/5 transition-colors cursor-pointer">
              <CardContent className="p-4 flex items-center gap-3">
                <Bell className="h-8 w-8 text-yellow-400" />
                <div>
                  <div className="font-semibold text-sm">Smart Alerts</div>
                  <div className="text-xs text-muted-foreground">Volume · price · breakouts</div>
                </div>
                <ArrowRight className="h-4 w-4 text-muted-foreground ml-auto" />
              </CardContent>
            </Card>
          </Link>
        </div>
      </div>
    </Layout>
  );
}
