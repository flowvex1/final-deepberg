import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { Layout } from "@/components/layout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Flame, TrendingUp, TrendingDown, Eye, Zap, RefreshCw,
  ArrowUpRight, ArrowDownRight, Sparkles, Trophy, AlertTriangle,
  CalendarDays,
} from "lucide-react";
import { format } from "date-fns";
import { Link } from "wouter";

const BASE = import.meta.env.BASE_URL.replace(/\/$/, "");

type Trade   = { symbol: string; move: string; why: string };
type Missed  = { symbol: string; move: string; setup: string };
type Mover   = { symbol: string; name: string; price: number; changePercent: number };

type RecapData = {
  date: string;
  marketSummary: string;
  bestTrades: Trade[];
  worstSignals: Trade[];
  missedOpportunities: Missed[];
  keyTakeaway: string;
  sentiment: string;
  sessionGrade: string;
  topGainers: Mover[];
  topLosers: Mover[];
  generatedAt: string;
};

const GRADE_COLOR: Record<string, string> = {
  A: "text-emerald-300 border-emerald-500/40 bg-emerald-500/10",
  B: "text-blue-300 border-blue-500/40 bg-blue-500/10",
  C: "text-amber-300 border-amber-500/40 bg-amber-500/10",
  D: "text-red-300 border-red-500/40 bg-red-500/10",
};

const SENTIMENT_COLOR: Record<string, string> = {
  bullish: "text-emerald-400",
  bearish: "text-red-400",
  mixed:   "text-amber-400",
};

export function DailyRecapPage() {
  const [data, setData] = useState<RecapData | null>(null);

  const mutation = useMutation<RecapData, Error>({
    mutationFn: async () => {
      const r = await fetch(`${BASE}/api/recap/daily`, { method: "POST" });
      if (!r.ok) throw new Error("Recap failed");
      return r.json();
    },
    onSuccess: (d) => setData(d),
  });

  const gradeClass = GRADE_COLOR[data?.sessionGrade ?? "C"] ?? GRADE_COLOR.C;
  const sentClass  = SENTIMENT_COLOR[data?.sentiment ?? "mixed"] ?? SENTIMENT_COLOR.mixed;

  return (
    <Layout>
      <div className="flex flex-col gap-6 max-w-4xl">

        {/* Header */}
        <div className="flex items-start justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold font-mono flex items-center gap-2">
              <Flame className="h-6 w-6 text-orange-400" />
              Daily Recap
            </h1>
            <p className="text-muted-foreground text-sm mt-1 flex items-center gap-1.5">
              <CalendarDays className="h-3.5 w-3.5" />
              {format(new Date(), "EEEE, MMMM d, yyyy")}
            </p>
          </div>
          <button
            onClick={() => mutation.mutate()}
            disabled={mutation.isPending}
            className="flex items-center gap-2 px-4 py-2 rounded-md border border-border text-sm font-mono text-muted-foreground hover:text-foreground hover:border-border/80 transition-colors disabled:opacity-40"
          >
            {mutation.isPending
              ? <><RefreshCw className="h-4 w-4 animate-spin" /> Generating…</>
              : data
              ? <><RefreshCw className="h-4 w-4" /> Regenerate</>
              : <><Sparkles className="h-4 w-4 text-orange-400" /> Generate Recap</>
            }
          </button>
        </div>

        {/* Empty state */}
        {!data && !mutation.isPending && (
          <Card className="border-border/60">
            <CardContent className="py-16 flex flex-col items-center gap-4 text-center">
              <Flame className="h-12 w-12 text-orange-400/30" />
              <div>
                <h3 className="font-bold text-lg mb-1">Generate today's recap</h3>
                <p className="text-muted-foreground text-sm max-w-sm">
                  Get an AI-written summary of the best trades, worst signals, and what you might have missed today.
                </p>
              </div>
              <button
                onClick={() => mutation.mutate()}
                className="mt-2 px-5 py-2.5 rounded-md bg-orange-500/10 border border-orange-500/30 text-orange-300 text-sm font-mono font-semibold hover:bg-orange-500/20 transition-colors flex items-center gap-2"
              >
                <Sparkles className="h-4 w-4" /> Generate Now
              </button>
            </CardContent>
          </Card>
        )}

        {/* Loading state */}
        {mutation.isPending && (
          <div className="flex flex-col gap-5">
            <Card className="border-orange-500/20 overflow-hidden">
              <div className="h-1 w-full bg-gradient-to-r from-transparent via-orange-500 to-transparent animate-pulse" />
              <CardContent className="p-6 space-y-3">
                <div className="flex items-center gap-2 text-muted-foreground">
                  <RefreshCw className="h-4 w-4 animate-spin" />
                  <span className="text-sm font-mono">Analyzing today's market activity…</span>
                </div>
                <Skeleton className="h-4 w-full" />
                <Skeleton className="h-4 w-5/6" />
                <Skeleton className="h-4 w-4/6" />
              </CardContent>
            </Card>
            {[...Array(3)].map((_, i) => (
              <Card key={i} className="border-border/50">
                <CardHeader><Skeleton className="h-5 w-40" /></CardHeader>
                <CardContent className="space-y-3">
                  <Skeleton className="h-4 w-full" />
                  <Skeleton className="h-4 w-5/6" />
                  <Skeleton className="h-4 w-3/6" />
                </CardContent>
              </Card>
            ))}
          </div>
        )}

        {/* Recap content */}
        {data && !mutation.isPending && (
          <div className="flex flex-col gap-5">

            {/* Market Summary + grade */}
            <Card className="border-border/70 overflow-hidden">
              <div className="h-[3px] w-full bg-gradient-to-r from-orange-500/60 via-amber-400/60 to-orange-500/60" />
              <CardContent className="p-5">
                <div className="flex items-start justify-between gap-4 mb-3">
                  <div className="flex items-center gap-2">
                    <Zap className="h-4 w-4 text-amber-400" />
                    <span className="font-bold font-mono text-sm uppercase tracking-wide">Market Summary</span>
                    <span className={`font-bold text-sm ${sentClass} capitalize`}>{data.sentiment}</span>
                  </div>
                  <span className={`text-xl font-black font-mono px-3 py-1 rounded border ${gradeClass}`}>
                    {data.sessionGrade}
                  </span>
                </div>
                <p className="text-sm leading-relaxed text-foreground/90">{data.marketSummary}</p>

                {/* Key takeaway */}
                {data.keyTakeaway && (
                  <div className="mt-4 rounded-md bg-amber-500/8 border border-amber-500/20 px-4 py-2.5">
                    <p className="text-xs font-bold uppercase tracking-wider text-amber-400 mb-1">Key Takeaway</p>
                    <p className="text-sm font-semibold leading-relaxed">{data.keyTakeaway}</p>
                  </div>
                )}

                {/* Raw movers row */}
                <div className="mt-4 pt-3 border-t border-border/30 grid grid-cols-2 gap-4">
                  <div>
                    <p className="text-xs text-muted-foreground uppercase tracking-wider mb-2 flex items-center gap-1">
                      <ArrowUpRight className="h-3 w-3 text-emerald-400" /> Top Gainers
                    </p>
                    <div className="flex flex-wrap gap-1.5">
                      {data.topGainers.map(m => (
                        <Link key={m.symbol} href={`/stock/${m.symbol}`}>
                          <span className="text-xs font-mono px-2 py-0.5 rounded bg-emerald-500/10 text-emerald-300 border border-emerald-500/20 hover:bg-emerald-500/20 transition-colors cursor-pointer">
                            {m.symbol} +{m.changePercent.toFixed(1)}%
                          </span>
                        </Link>
                      ))}
                    </div>
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground uppercase tracking-wider mb-2 flex items-center gap-1">
                      <ArrowDownRight className="h-3 w-3 text-red-400" /> Top Losers
                    </p>
                    <div className="flex flex-wrap gap-1.5">
                      {data.topLosers.map(m => (
                        <Link key={m.symbol} href={`/stock/${m.symbol}`}>
                          <span className="text-xs font-mono px-2 py-0.5 rounded bg-red-500/10 text-red-300 border border-red-500/20 hover:bg-red-500/20 transition-colors cursor-pointer">
                            {m.symbol} {m.changePercent.toFixed(1)}%
                          </span>
                        </Link>
                      ))}
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* Best Trades */}
            <Card className="border-emerald-500/20">
              <CardHeader className="pb-3 border-b border-emerald-500/10">
                <CardTitle className="flex items-center gap-2 text-emerald-300 font-mono text-base">
                  <Trophy className="h-4 w-4" /> Best Trades Today
                </CardTitle>
              </CardHeader>
              <CardContent className="pt-4 space-y-3">
                {(data.bestTrades as Trade[]).map((t, i) => (
                  <div key={i} className="flex items-start gap-3 pb-3 border-b border-border/30 last:border-0 last:pb-0">
                    <div className="shrink-0 w-7 h-7 rounded-full bg-emerald-500/15 flex items-center justify-center">
                      <TrendingUp className="h-3.5 w-3.5 text-emerald-400" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-0.5">
                        <Link href={`/stock/${t.symbol}`}>
                          <span className="font-bold font-mono text-sm text-emerald-300 hover:text-emerald-200 cursor-pointer">{t.symbol}</span>
                        </Link>
                        <Badge variant="outline" className="text-xs font-mono border-emerald-500/30 text-emerald-400">{t.move}</Badge>
                      </div>
                      <p className="text-sm text-muted-foreground leading-relaxed">{t.why}</p>
                    </div>
                  </div>
                ))}
              </CardContent>
            </Card>

            {/* Worst Signals */}
            <Card className="border-red-500/20">
              <CardHeader className="pb-3 border-b border-red-500/10">
                <CardTitle className="flex items-center gap-2 text-red-300 font-mono text-base">
                  <AlertTriangle className="h-4 w-4" /> Worst Signals
                </CardTitle>
              </CardHeader>
              <CardContent className="pt-4 space-y-3">
                {(data.worstSignals as Trade[]).map((t, i) => (
                  <div key={i} className="flex items-start gap-3 pb-3 border-b border-border/30 last:border-0 last:pb-0">
                    <div className="shrink-0 w-7 h-7 rounded-full bg-red-500/15 flex items-center justify-center">
                      <TrendingDown className="h-3.5 w-3.5 text-red-400" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-0.5">
                        <Link href={`/stock/${t.symbol}`}>
                          <span className="font-bold font-mono text-sm text-red-300 hover:text-red-200 cursor-pointer">{t.symbol}</span>
                        </Link>
                        <Badge variant="outline" className="text-xs font-mono border-red-500/30 text-red-400">{t.move}</Badge>
                      </div>
                      <p className="text-sm text-muted-foreground leading-relaxed">{t.why}</p>
                    </div>
                  </div>
                ))}
              </CardContent>
            </Card>

            {/* Missed Opportunities */}
            <Card className="border-blue-500/20">
              <CardHeader className="pb-3 border-b border-blue-500/10">
                <CardTitle className="flex items-center gap-2 text-blue-300 font-mono text-base">
                  <Eye className="h-4 w-4" /> Missed Opportunities
                </CardTitle>
              </CardHeader>
              <CardContent className="pt-4 space-y-3">
                {(data.missedOpportunities as Missed[]).map((t, i) => (
                  <div key={i} className="flex items-start gap-3 pb-3 border-b border-border/30 last:border-0 last:pb-0">
                    <div className="shrink-0 w-7 h-7 rounded-full bg-blue-500/15 flex items-center justify-center">
                      <Eye className="h-3.5 w-3.5 text-blue-400" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-0.5">
                        <Link href={`/stock/${t.symbol}`}>
                          <span className="font-bold font-mono text-sm text-blue-300 hover:text-blue-200 cursor-pointer">{t.symbol}</span>
                        </Link>
                        <Badge variant="outline" className="text-xs font-mono border-blue-500/30 text-blue-400">{t.move}</Badge>
                      </div>
                      <p className="text-sm text-muted-foreground leading-relaxed">{t.setup}</p>
                    </div>
                  </div>
                ))}
              </CardContent>
            </Card>

            {/* Footer */}
            <p className="text-xs text-muted-foreground/50 text-right font-mono">
              Generated {format(new Date(data.generatedAt), "h:mm a")} · Cached until next generation · Not financial advice
            </p>
          </div>
        )}
      </div>
    </Layout>
  );
}
