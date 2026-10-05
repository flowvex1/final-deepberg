import { useParams } from "wouter";
import { useEffect, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  useGetStockQuote, useGetStockNews,
  useAnalyzeStock, useAnalyzeLongTerm, useAnalyzeSwing,
  getGetStockQuoteQueryKey, getGetStockNewsQueryKey,
} from "@workspace/api-client-react";
import { Layout } from "@/components/layout";
import { StockChart } from "@/components/stock-chart";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { useMode } from "@/hooks/use-mode";
import {
  ArrowUpRight, ArrowDownRight, Sparkles, Newspaper, Info, Zap,
  TrendingUp, TrendingDown, RefreshCw, Loader2, Clock, Target,
  ShieldAlert, BarChart2, ChevronRight, DollarSign,
} from "lucide-react";
import { format } from "date-fns";

const BASE = import.meta.env.BASE_URL.replace(/\/$/, "");

type AnalysisTab = "overview" | "longterm" | "swing";

type ConfidenceData = {
  symbol: string; overall: number; verdict: string; verdictColor: string; action: string;
  factors: Array<{ name: string; score: number; verdict: string; detail: string; color: string; isRisk: boolean }>;
};

const MOMENTUM_CONFIG: Record<string, { label: string; color: string }> = {
  strong_bullish: { label: "Strong Bullish", color: "text-emerald-400" },
  bullish:        { label: "Bullish",         color: "text-emerald-400" },
  neutral:        { label: "Neutral",         color: "text-amber-400"  },
  bearish:        { label: "Bearish",         color: "text-red-400"    },
  strong_bearish: { label: "Strong Bearish",  color: "text-red-400"    },
};

const TREND_CONFIG: Record<string, { label: string; icon: typeof TrendingUp; color: string }> = {
  uptrend:   { label: "Uptrend",   icon: TrendingUp,   color: "text-emerald-400" },
  sideways:  { label: "Sideways",  icon: BarChart2,     color: "text-amber-400"  },
  downtrend: { label: "Downtrend", icon: TrendingDown,  color: "text-red-400"    },
};

export function StockDetail() {
  const { symbol } = useParams();
  const safeSymbol = symbol || "";
  const { mode } = useMode();
  const autoAnalyzed = useRef<string>("");
  const [activeTab, setActiveTab] = useState<AnalysisTab>("overview");

  const { data: quote, isLoading: isLoadingQuote } = useGetStockQuote(
    safeSymbol,
    { query: { enabled: !!safeSymbol, queryKey: getGetStockQuoteQueryKey(safeSymbol) } }
  );

  const { data: confidence, isLoading: isLoadingConfidence } = useQuery<ConfidenceData>({
    queryKey: ["confidence", safeSymbol],
    queryFn: async () => {
      const r = await fetch(`${BASE}/api/stocks/${safeSymbol}/confidence`);
      if (!r.ok) throw new Error("confidence fetch failed");
      return r.json();
    },
    enabled: !!safeSymbol,
    staleTime: 5 * 60 * 1000,
  });
  const { data: news, isLoading: isLoadingNews } = useGetStockNews(
    safeSymbol,
    { query: { enabled: !!safeSymbol, queryKey: getGetStockNewsQueryKey(safeSymbol) } }
  );

  const overviewMutation = useAnalyzeStock();
  const longtermMutation = useAnalyzeLongTerm();
  const swingMutation    = useAnalyzeSwing();

  useEffect(() => {
    if (!quote || !safeSymbol || autoAnalyzed.current === safeSymbol) return;
    autoAnalyzed.current = safeSymbol;
    if (mode === "invest") {
      longtermMutation.mutate({ symbol: safeSymbol });
    } else {
      overviewMutation.mutate({ symbol: safeSymbol });
    }
  }, [quote, safeSymbol, mode]);

  const handleTabAnalyze = (tab: AnalysisTab) => {
    if (!safeSymbol) return;
    if (tab === "overview" && !overviewMutation.isPending) overviewMutation.mutate({ symbol: safeSymbol });
    if (tab === "longterm" && !longtermMutation.isPending) longtermMutation.mutate({ symbol: safeSymbol });
    if (tab === "swing"    && !swingMutation.isPending)    swingMutation.mutate({ symbol: safeSymbol });
  };

  const isPositive = quote ? quote.change >= 0 : true;

  const fmtLarge = (num: number | null | undefined) => {
    if (!num) return "-";
    if (num >= 1e12) return `$${(num / 1e12).toFixed(2)}T`;
    if (num >= 1e9)  return `$${(num / 1e9).toFixed(2)}B`;
    if (num >= 1e6)  return `$${(num / 1e6).toFixed(2)}M`;
    return num.toLocaleString();
  };

  const tabClass = (tab: AnalysisTab) =>
    `px-4 py-2 text-sm font-semibold font-mono rounded-md transition-colors border ${
      activeTab === tab
        ? tab === "swing"
          ? "bg-amber-500/10 border-amber-500/30 text-amber-300"
          : tab === "longterm"
          ? "bg-emerald-500/10 border-emerald-500/30 text-emerald-300"
          : "bg-primary/10 border-primary/30 text-primary"
        : "border-border text-muted-foreground hover:text-foreground hover:border-border/80"
    }`;

  /* ── Shared price header ─────────────────────────────────── */
  const PriceHeader = () => (
    <div className="flex flex-col md:flex-row justify-between items-start md:items-end gap-4">
      <div className="flex flex-col gap-1">
        {isLoadingQuote ? (
          <>
            <Skeleton className="h-10 w-48 mb-2" />
            <Skeleton className="h-5 w-32" />
          </>
        ) : quote ? (
          <>
            <div className="flex items-center gap-3">
              <h1 className="text-4xl font-bold font-mono tracking-tight">{quote.symbol}</h1>
              <Badge variant="outline" className="text-xs font-mono">{quote.exchange}</Badge>
            </div>
            <p className="text-xl text-muted-foreground">{quote.name}</p>
            <div className="flex items-center gap-4 mt-2">
              <span className="text-4xl font-mono font-bold">${quote.price.toFixed(2)}</span>
              <div className={`flex items-center text-xl font-mono ${isPositive ? "text-chart-2" : "text-destructive"}`}>
                {isPositive ? <ArrowUpRight className="h-6 w-6 mr-1" /> : <ArrowDownRight className="h-6 w-6 mr-1" />}
                {Math.abs(quote.change).toFixed(2)} ({isPositive ? "+" : ""}{quote.changePercent.toFixed(2)}%)
              </div>
            </div>
          </>
        ) : (
          <h1 className="text-2xl font-bold">Symbol not found</h1>
        )}
      </div>
    </div>
  );

  /* ══════════════════════════════════════════════════════════
     INVEST MODE — fundamentals & profitability view
  ══════════════════════════════════════════════════════════ */
  if (mode === "invest") {
    return (
      <Layout>
        <div className="flex flex-col gap-6">
          <PriceHeader />

          <ConfidenceWidget data={confidence} isLoading={isLoadingConfidence} />

          {/* Key fundamentals grid */}
          {quote && (
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              <FundamentalCard label="Market Cap"   value={fmtLarge(quote.marketCap)} icon={DollarSign} color="emerald" />
              <FundamentalCard label="P/E Ratio"    value={quote.peRatio?.toFixed(2) ?? "-"} icon={BarChart2} color="blue" />
              <FundamentalCard label="EPS"          value={quote.eps ? `$${quote.eps.toFixed(2)}` : "-"} icon={TrendingUp} color="emerald" />
              <FundamentalCard label="Dividend"     value={quote.dividendYield ? `${(quote.dividendYield as number).toFixed(2)}%` : "None"} icon={Zap} color="amber" />
              <FundamentalCard label="52W High"     value={`$${quote.fiftyTwoWeekHigh?.toFixed(2) ?? "-"}`} icon={ArrowUpRight} color="emerald" />
              <FundamentalCard label="52W Low"      value={`$${quote.fiftyTwoWeekLow?.toFixed(2) ?? "-"}`} icon={ArrowDownRight} color="red" />
              <FundamentalCard label="Volume"       value={fmtLarge(quote.volume)} icon={BarChart2} color="blue" />
              <FundamentalCard label="Avg Volume"   value={fmtLarge(quote.avgVolume)} icon={BarChart2} color="blue" />
            </div>
          )}

          {/* Why this stock is profitable */}
          <div>
            <div className="flex items-center justify-between mb-3">
              <h2 className="text-lg font-bold flex items-center gap-2">
                <Sparkles className="h-5 w-5 text-emerald-400" />
                Investment Case
              </h2>
              <button
                onClick={() => longtermMutation.mutate({ symbol: safeSymbol })}
                disabled={longtermMutation.isPending || !quote}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-md border border-border text-xs text-muted-foreground hover:text-foreground transition-colors disabled:opacity-40 font-mono"
              >
                <RefreshCw className="h-3.5 w-3.5" />
                {longtermMutation.isPending ? "Analyzing…" : "Refresh"}
              </button>
            </div>

            {longtermMutation.isPending && <AnalysisLoader color="emerald" />}

            {!longtermMutation.data && !longtermMutation.isPending && (
              <Card className="border-emerald-500/20">
                <CardContent className="p-8 flex flex-col items-center gap-3 text-center">
                  <TrendingUp className="h-8 w-8 text-emerald-400/40" />
                  <p className="text-sm text-muted-foreground">AI investment analysis loading…</p>
                </CardContent>
              </Card>
            )}

            {longtermMutation.data && !longtermMutation.isPending && (() => {
              const d = longtermMutation.data;
              return (
                <Card className="border-emerald-500/30 bg-emerald-950/10">
                  <CardHeader className="pb-3 border-b border-emerald-500/10">
                    <div className="flex justify-between items-center flex-wrap gap-2">
                      <CardTitle className="flex items-center gap-2 text-emerald-300 font-mono text-base">
                        <TrendingUp className="h-4 w-4" /> Why This Stock Is Profitable
                      </CardTitle>
                      <div className="flex gap-2 flex-wrap">
                        <SentimentBadge sentiment={d.sentiment} />
                        {d.priceTarget1Y && (
                          <Badge variant="outline" className="font-mono border-emerald-500/30 text-emerald-400">
                            1Y Target: ${(d.priceTarget1Y as number).toFixed(2)}
                          </Badge>
                        )}
                        {d.priceTarget3Y && (
                          <Badge variant="outline" className="font-mono border-emerald-500/20 text-emerald-400/80">
                            3Y Target: ${(d.priceTarget3Y as number).toFixed(2)}
                          </Badge>
                        )}
                      </div>
                    </div>
                  </CardHeader>
                  <CardContent className="pt-5 space-y-5">
                    {/* Thesis */}
                    <div className="rounded-md bg-emerald-500/10 border border-emerald-500/20 px-4 py-3">
                      <h4 className="text-xs font-bold uppercase tracking-wider text-emerald-400 mb-2 flex items-center gap-1.5">
                        <Zap className="h-3.5 w-3.5" /> Investment Thesis
                      </h4>
                      <p className="text-sm leading-relaxed">{d.thesis}</p>
                    </div>

                    {/* Future outlook */}
                    <div className="rounded-md bg-muted/30 border border-border px-4 py-3">
                      <h4 className="text-xs font-bold uppercase tracking-wider text-muted-foreground mb-2 flex items-center gap-1.5">
                        <ChevronRight className="h-3.5 w-3.5" /> 3–5 Year Outlook
                      </h4>
                      <p className="text-sm leading-relaxed">{d.futureOutlook}</p>
                    </div>

                    {/* Growth catalysts + risks */}
                    <div className="grid md:grid-cols-2 gap-5">
                      <div className="space-y-2">
                        <h4 className="font-bold text-sm flex items-center gap-2">
                          <TrendingUp className="h-4 w-4 text-emerald-400" /> Growth Catalysts
                        </h4>
                        <ul className="space-y-1.5">
                          {(d.growthCatalysts as string[]).map((c, i) => (
                            <li key={i} className="text-sm flex items-start gap-2">
                              <span className="text-emerald-400 mt-0.5 shrink-0">→</span>{c}
                            </li>
                          ))}
                        </ul>
                      </div>
                      <div className="space-y-2">
                        <h4 className="font-bold text-sm flex items-center gap-2">
                          <ShieldAlert className="h-4 w-4 text-red-400" /> Risks to Watch
                        </h4>
                        <ul className="space-y-1.5">
                          {(d.longTermRisks as string[]).map((r, i) => (
                            <li key={i} className="text-sm flex items-start gap-2">
                              <span className="text-red-400 mt-0.5 shrink-0">−</span>{r}
                            </li>
                          ))}
                        </ul>
                      </div>
                    </div>

                    {/* Valuation */}
                    <div className="pt-4 border-t border-emerald-500/10">
                      <h4 className="font-bold mb-1.5 text-xs text-muted-foreground uppercase tracking-wider">Valuation View</h4>
                      <p className="text-sm">{d.valuationView}</p>
                    </div>
                    <p className="text-xs text-muted-foreground/50 italic">Not financial advice.</p>
                  </CardContent>
                </Card>
              );
            })()}
          </div>

          {/* Chart + News side by side */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            <div className="lg:col-span-2">
              <Card>
                <CardContent className="p-6">
                  <StockChart symbol={safeSymbol} isPositive={isPositive} />
                </CardContent>
              </Card>
            </div>
            <div>
              <Card className="h-full">
                <CardHeader className="flex flex-row items-center justify-between">
                  <CardTitle className="text-base flex items-center gap-2">
                    <Newspaper className="h-4 w-4" /> Recent News
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  <NewsSection news={news} isLoading={isLoadingNews} />
                </CardContent>
              </Card>
            </div>
          </div>
        </div>
      </Layout>
    );
  }

  /* ══════════════════════════════════════════════════════════
     OPTIONS MODE — full trading analysis view (unchanged)
  ══════════════════════════════════════════════════════════ */
  return (
    <Layout>
      <div className="flex flex-col gap-6">

        <PriceHeader />

        <ConfidenceWidget data={confidence} isLoading={isLoadingConfidence} />

        {/* Analysis Tab Switcher */}
        <div className="flex flex-col gap-4">
          <div className="flex items-center gap-2 flex-wrap">
            <button className={tabClass("overview")} onClick={() => setActiveTab("overview")}>
              <Sparkles className="inline h-3.5 w-3.5 mr-1.5 -mt-0.5" />Overview
            </button>
            <button
              className={tabClass("longterm")}
              onClick={() => {
                setActiveTab("longterm");
                if (!longtermMutation.data && !longtermMutation.isPending) handleTabAnalyze("longterm");
              }}
            >
              <TrendingUp className="inline h-3.5 w-3.5 mr-1.5 -mt-0.5" />Long-Term
            </button>
            <button
              className={tabClass("swing")}
              onClick={() => {
                setActiveTab("swing");
                if (!swingMutation.data && !swingMutation.isPending) handleTabAnalyze("swing");
              }}
            >
              <BarChart2 className="inline h-3.5 w-3.5 mr-1.5 -mt-0.5" />Swing Trade
            </button>

            <button
              onClick={() => handleTabAnalyze(activeTab)}
              disabled={
                (activeTab === "overview" && overviewMutation.isPending) ||
                (activeTab === "longterm" && longtermMutation.isPending) ||
                (activeTab === "swing"    && swingMutation.isPending)    ||
                !quote
              }
              className="ml-auto flex items-center gap-1.5 px-3 py-2 rounded-md border border-border text-xs text-muted-foreground hover:text-foreground hover:border-border/80 transition-colors disabled:opacity-40 font-mono"
            >
              <RefreshCw className="h-3.5 w-3.5" />
              {(activeTab === "overview" && overviewMutation.isPending) ||
               (activeTab === "longterm" && longtermMutation.isPending) ||
               (activeTab === "swing"    && swingMutation.isPending) ? "Analyzing…" : "Re-analyze"}
            </button>
          </div>

          {/* OVERVIEW TAB */}
          {activeTab === "overview" && (
            <>
              {overviewMutation.isPending && <AnalysisLoader />}
              {overviewMutation.data && !overviewMutation.isPending && (
                <Card className="border-primary/50 shadow-md shadow-primary/10 bg-primary/5">
                  <CardHeader className="pb-3 border-b border-primary/10">
                    <div className="flex justify-between items-center flex-wrap gap-2">
                      <CardTitle className="flex items-center gap-2 text-primary font-mono">
                        <Sparkles className="h-5 w-5" /> AI Analysis Report
                      </CardTitle>
                      <div className="flex gap-2 flex-wrap">
                        <SentimentBadge sentiment={overviewMutation.data.sentiment} />
                        <Badge variant="outline" className="font-mono bg-background border-primary/30">
                          {(overviewMutation.data.recommendation as string).replace(/_/g, " ").toUpperCase()}
                        </Badge>
                        {overviewMutation.data.priceTarget && (
                          <Badge variant="outline" className="font-mono bg-background border-chart-2/40 text-chart-2">
                            Target: ${(overviewMutation.data.priceTarget as number).toFixed(2)}
                          </Badge>
                        )}
                      </div>
                    </div>
                  </CardHeader>
                  <CardContent className="pt-6 space-y-5">
                    {((overviewMutation.data as unknown as Record<string, unknown>).whyMoving as string | undefined) && (
                      <div className="rounded-md bg-primary/10 border border-primary/20 px-4 py-3">
                        <h4 className="text-xs font-bold uppercase tracking-wider text-primary mb-1.5 flex items-center gap-1.5">
                          <Zap className="h-3.5 w-3.5" /> Why It's Moving
                        </h4>
                        <p className="text-sm leading-relaxed">{((overviewMutation.data as unknown as Record<string, unknown>).whyMoving as string | undefined) as string}</p>
                      </div>
                    )}
                    <div className="text-base leading-relaxed border-l-2 border-primary/50 pl-4 py-0.5 italic text-muted-foreground">
                      "{overviewMutation.data.summary}"
                    </div>
                    <div className="grid md:grid-cols-2 gap-5">
                      <StrengthRiskList title="Key Strengths" items={overviewMutation.data.keyStrengths} type="strength" />
                      <StrengthRiskList title="Key Risks"     items={overviewMutation.data.keyRisks}     type="risk" />
                    </div>
                    <div className="grid md:grid-cols-2 gap-4 pt-4 border-t border-primary/10">
                      <OutlookBlock title="Technical Outlook"    text={overviewMutation.data.technicalOutlook} />
                      <OutlookBlock title="Fundamental Outlook"  text={overviewMutation.data.fundamentalOutlook} />
                    </div>
                    {((overviewMutation.data as unknown as Record<string, unknown>).tradeSetups as string | undefined) && (
                      <div className="rounded-md bg-muted/50 border border-border px-4 py-3">
                        <h4 className="text-xs font-bold uppercase tracking-wider text-muted-foreground mb-1.5">Possible Trade Setups</h4>
                        <p className="text-sm leading-relaxed">{((overviewMutation.data as unknown as Record<string, unknown>).tradeSetups as string | undefined) as string}</p>
                        <p className="text-xs text-muted-foreground/60 mt-2 italic">Not financial advice.</p>
                      </div>
                    )}
                  </CardContent>
                </Card>
              )}
            </>
          )}

          {/* LONG-TERM TAB */}
          {activeTab === "longterm" && (
            <>
              {longtermMutation.isPending && <AnalysisLoader color="emerald" />}
              {!longtermMutation.data && !longtermMutation.isPending && (
                <EmptyAnalysis
                  color="emerald"
                  label="Long-Term Analysis"
                  description="3–5 year investment thesis, growth catalysts, valuation, and future outlook."
                  onAnalyze={() => handleTabAnalyze("longterm")}
                />
              )}
              {longtermMutation.data && !longtermMutation.isPending && (() => {
                const d = longtermMutation.data;
                return (
                  <Card className="border-emerald-500/30 bg-emerald-950/10">
                    <CardHeader className="pb-3 border-b border-emerald-500/10">
                      <div className="flex justify-between items-center flex-wrap gap-2">
                        <CardTitle className="flex items-center gap-2 text-emerald-300 font-mono">
                          <TrendingUp className="h-5 w-5" /> Long-Term Investment Thesis
                        </CardTitle>
                        <div className="flex gap-2 flex-wrap">
                          <SentimentBadge sentiment={d.sentiment} />
                          {d.priceTarget1Y && (
                            <Badge variant="outline" className="font-mono border-emerald-500/30 text-emerald-400">
                              1Y Target: ${(d.priceTarget1Y as number).toFixed(2)}
                            </Badge>
                          )}
                          {d.priceTarget3Y && (
                            <Badge variant="outline" className="font-mono border-emerald-500/20 text-emerald-400/80">
                              3Y Target: ${(d.priceTarget3Y as number).toFixed(2)}
                            </Badge>
                          )}
                        </div>
                      </div>
                    </CardHeader>
                    <CardContent className="pt-6 space-y-5">
                      <div className="rounded-md bg-emerald-500/10 border border-emerald-500/20 px-4 py-3">
                        <h4 className="text-xs font-bold uppercase tracking-wider text-emerald-400 mb-2 flex items-center gap-1.5">
                          <Zap className="h-3.5 w-3.5" /> Investment Thesis
                        </h4>
                        <p className="text-sm leading-relaxed">{d.thesis}</p>
                      </div>
                      <div className="rounded-md bg-muted/30 border border-border px-4 py-3">
                        <h4 className="text-xs font-bold uppercase tracking-wider text-muted-foreground mb-2 flex items-center gap-1.5">
                          <ChevronRight className="h-3.5 w-3.5" /> 3–5 Year Outlook
                        </h4>
                        <p className="text-sm leading-relaxed">{d.futureOutlook}</p>
                      </div>
                      <div className="grid md:grid-cols-2 gap-5">
                        <div className="space-y-2">
                          <h4 className="font-bold text-sm flex items-center gap-2">
                            <TrendingUp className="h-4 w-4 text-emerald-400" /> Growth Catalysts
                          </h4>
                          <ul className="space-y-1.5">
                            {(d.growthCatalysts as string[]).map((c, i) => (
                              <li key={i} className="text-sm flex items-start gap-2">
                                <span className="text-emerald-400 mt-0.5 shrink-0">→</span>{c}
                              </li>
                            ))}
                          </ul>
                        </div>
                        <div className="space-y-2">
                          <h4 className="font-bold text-sm flex items-center gap-2">
                            <ShieldAlert className="h-4 w-4 text-red-400" /> Long-Term Risks
                          </h4>
                          <ul className="space-y-1.5">
                            {(d.longTermRisks as string[]).map((r, i) => (
                              <li key={i} className="text-sm flex items-start gap-2">
                                <span className="text-red-400 mt-0.5 shrink-0">−</span>{r}
                              </li>
                            ))}
                          </ul>
                        </div>
                      </div>
                      <div className="pt-4 border-t border-emerald-500/10">
                        <h4 className="font-bold mb-1.5 text-xs text-muted-foreground uppercase tracking-wider">Valuation View</h4>
                        <p className="text-sm">{d.valuationView}</p>
                      </div>
                      <p className="text-xs text-muted-foreground/50 italic">Not financial advice.</p>
                    </CardContent>
                  </Card>
                );
              })()}
            </>
          )}

          {/* SWING TRADE TAB */}
          {activeTab === "swing" && (
            <>
              {swingMutation.isPending && <AnalysisLoader color="amber" />}
              {!swingMutation.data && !swingMutation.isPending && (
                <EmptyAnalysis
                  color="amber"
                  label="Swing Trade Analysis"
                  description="Technical setup, key levels, entry zone, stop loss, and risk/reward."
                  onAnalyze={() => handleTabAnalyze("swing")}
                />
              )}
              {swingMutation.data && !swingMutation.isPending && (() => {
                const d = swingMutation.data;
                const trendCfg = TREND_CONFIG[d.trend] ?? TREND_CONFIG.sideways;
                const TrendIcon = trendCfg.icon;
                const momCfg = MOMENTUM_CONFIG[d.momentum] ?? MOMENTUM_CONFIG.neutral;
                return (
                  <Card className="border-amber-500/30 bg-amber-950/10">
                    <CardHeader className="pb-3 border-b border-amber-500/10">
                      <div className="flex justify-between items-center flex-wrap gap-2">
                        <CardTitle className="flex items-center gap-2 text-amber-300 font-mono">
                          <BarChart2 className="h-5 w-5" /> Swing Trade Setup
                        </CardTitle>
                        <div className="flex gap-2 flex-wrap items-center">
                          <Badge variant="outline" className={`font-mono border-amber-500/30 ${trendCfg.color} flex items-center gap-1`}>
                            <TrendIcon className="h-3 w-3" />{trendCfg.label}
                          </Badge>
                          <Badge variant="outline" className={`font-mono border-amber-500/20 ${momCfg.color}`}>
                            {momCfg.label}
                          </Badge>
                          {d.riskReward && (
                            <Badge variant="outline" className="font-mono border-border text-foreground/70">
                              R/R {d.riskReward}
                            </Badge>
                          )}
                        </div>
                      </div>
                    </CardHeader>
                    <CardContent className="pt-6 space-y-5">
                      <div className="rounded-md bg-amber-500/10 border border-amber-500/20 px-4 py-3">
                        <h4 className="text-xs font-bold uppercase tracking-wider text-amber-400 mb-2 flex items-center gap-1.5">
                          <BarChart2 className="h-3.5 w-3.5" /> Technical Setup
                        </h4>
                        <p className="text-sm leading-relaxed">{d.setup}</p>
                      </div>
                      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                        <LevelCard label="Entry Zone"   value={d.entryZone}                              color="text-primary" />
                        <LevelCard label="Target"       value={d.targetPrice ? `$${(d.targetPrice as number).toFixed(2)}` : "—"} color="text-emerald-400" />
                        <LevelCard label="Stop Loss"    value={d.stopLoss    ? `$${(d.stopLoss as number).toFixed(2)}`    : "—"} color="text-red-400" />
                        <LevelCard label="Timeframe"    value={d.timeframe}                              color="text-muted-foreground" />
                      </div>
                      <div className="grid md:grid-cols-2 gap-3">
                        {d.keySupport && (
                          <div className="rounded-md border border-emerald-500/20 bg-emerald-500/5 px-4 py-2.5">
                            <p className="text-xs text-muted-foreground uppercase tracking-wider mb-0.5">Key Support</p>
                            <p className="font-mono font-bold text-emerald-400 text-lg">${(d.keySupport as number).toFixed(2)}</p>
                          </div>
                        )}
                        {d.keyResistance && (
                          <div className="rounded-md border border-red-500/20 bg-red-500/5 px-4 py-2.5">
                            <p className="text-xs text-muted-foreground uppercase tracking-wider mb-0.5">Key Resistance</p>
                            <p className="font-mono font-bold text-red-400 text-lg">${(d.keyResistance as number).toFixed(2)}</p>
                          </div>
                        )}
                      </div>
                      {(d.keyWatchLevels as string[]).length > 0 && (
                        <div>
                          <h4 className="text-xs font-bold uppercase tracking-wider text-muted-foreground mb-2 flex items-center gap-1.5">
                            <Target className="h-3.5 w-3.5" /> Levels to Watch
                          </h4>
                          <ul className="space-y-1">
                            {(d.keyWatchLevels as string[]).map((lvl, i) => (
                              <li key={i} className="text-sm flex items-start gap-2">
                                <span className="text-amber-400 mt-0.5 shrink-0 font-mono">◆</span>{lvl}
                              </li>
                            ))}
                          </ul>
                        </div>
                      )}
                      {d.tradingNotes && (
                        <div className="rounded-md bg-muted/40 border border-border px-4 py-3">
                          <h4 className="text-xs font-bold uppercase tracking-wider text-muted-foreground mb-1.5 flex items-center gap-1.5">
                            <Clock className="h-3.5 w-3.5" /> Trading Notes
                          </h4>
                          <p className="text-sm leading-relaxed">{d.tradingNotes}</p>
                        </div>
                      )}
                      <p className="text-xs text-muted-foreground/50 italic">Not financial advice. Always use proper risk management.</p>
                    </CardContent>
                  </Card>
                );
              })()}
            </>
          )}
        </div>

        {/* Main Content Grid */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <div className="lg:col-span-2 flex flex-col gap-6">
            <Card>
              <CardContent className="p-6">
                <StockChart symbol={safeSymbol} isPositive={isPositive} />
              </CardContent>
            </Card>
            <Card>
              <CardHeader>
                <CardTitle className="text-lg">Key Statistics</CardTitle>
              </CardHeader>
              <CardContent>
                {isLoadingQuote ? (
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                    {[...Array(8)].map((_, i) => (
                      <div key={i} className="space-y-1">
                        <Skeleton className="h-3 w-16" />
                        <Skeleton className="h-5 w-24" />
                      </div>
                    ))}
                  </div>
                ) : quote ? (
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-6">
                    <MetricItem label="Open"       value={`$${quote.open?.toFixed(2) || "-"}`} />
                    <MetricItem label="High"       value={`$${quote.high?.toFixed(2) || "-"}`} />
                    <MetricItem label="Low"        value={`$${quote.low?.toFixed(2) || "-"}`} />
                    <MetricItem label="Prev Close" value={`$${quote.previousClose?.toFixed(2) || "-"}`} />
                    <MetricItem label="Volume"     value={fmtLarge(quote.volume)} />
                    <MetricItem label="Avg Volume" value={fmtLarge(quote.avgVolume)} />
                    <MetricItem label="Market Cap" value={fmtLarge(quote.marketCap)} />
                    <MetricItem label="P/E Ratio"  value={quote.peRatio?.toFixed(2) || "-"} />
                    <MetricItem label="EPS"        value={`$${quote.eps?.toFixed(2) || "-"}`} />
                    <MetricItem label="Yield"      value={quote.dividendYield ? `${(quote.dividendYield as number).toFixed(2)}%` : "-"} />
                    <MetricItem label="52W High"   value={`$${quote.fiftyTwoWeekHigh?.toFixed(2) || "-"}`} />
                    <MetricItem label="52W Low"    value={`$${quote.fiftyTwoWeekLow?.toFixed(2) || "-"}`} />
                  </div>
                ) : null}
              </CardContent>
            </Card>
          </div>
          <div className="flex flex-col gap-6">
            <Card className="h-full">
              <CardHeader>
                <CardTitle className="text-lg flex items-center gap-2">
                  <Newspaper className="h-5 w-5" /> Recent News
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <NewsSection news={news} isLoading={isLoadingNews} />
              </CardContent>
            </Card>
          </div>
        </div>
      </div>
    </Layout>
  );
}

/* ─── Helper components ──────────────────────────────────────── */

function FundamentalCard({
  label, value, icon: Icon, color,
}: { label: string; value: string; icon: any; color: string }) {
  const colorMap: Record<string, string> = {
    emerald: "text-emerald-400",
    blue:    "text-blue-400",
    amber:   "text-amber-400",
    red:     "text-red-400",
  };
  return (
    <div className="rounded-lg border border-border bg-card/60 px-4 py-3 flex flex-col gap-1">
      <span className="text-xs text-muted-foreground uppercase tracking-wider flex items-center gap-1.5">
        <Icon className={`h-3 w-3 ${colorMap[color]}`} />{label}
      </span>
      <span className={`font-mono font-bold text-lg ${colorMap[color]}`}>{value}</span>
    </div>
  );
}

function NewsSection({ news, isLoading }: { news: any[] | undefined; isLoading: boolean }) {
  if (isLoading) {
    return (
      <>
        {[...Array(4)].map((_, i) => (
          <div key={i} className="space-y-2">
            <Skeleton className="h-4 w-full" />
            <Skeleton className="h-3 w-2/3" />
          </div>
        ))}
      </>
    );
  }
  if (!news || news.length === 0) {
    return (
      <div className="text-sm text-muted-foreground flex flex-col items-center justify-center py-8 text-center">
        <Info className="h-8 w-8 mb-2 opacity-20" />
        No recent news found.
      </div>
    );
  }
  return (
    <>
      {news.map((article, i) => (
        <a key={i} href={article.link} target="_blank" rel="noopener noreferrer" className="block group">
          <div className="flex flex-col gap-1 border-b border-border/50 pb-4 last:border-0 last:pb-0">
            <div className="flex items-center gap-2 text-xs text-muted-foreground mb-1">
              <span className="font-semibold text-foreground/80">{article.publisher}</span>
              <span>·</span>
              <span>{format(new Date(article.publishedAt), "MMM d, yyyy")}</span>
            </div>
            <h4 className="font-medium group-hover:text-primary transition-colors line-clamp-2">{article.title}</h4>
          </div>
        </a>
      ))}
    </>
  );
}

function MetricItem({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="flex flex-col gap-1">
      <span className="text-xs text-muted-foreground uppercase tracking-wider">{label}</span>
      <span className="font-mono font-medium">{value}</span>
    </div>
  );
}

function AnalysisLoader({ color = "primary" }: { color?: string }) {
  const border = color === "emerald" ? "border-emerald-500/50" : color === "amber" ? "border-amber-500/50" : "border-primary/50";
  const via    = color === "emerald" ? "via-emerald-500"       : color === "amber" ? "via-amber-500"       : "via-primary";
  return (
    <Card className={`${border} overflow-hidden`}>
      <div className={`h-1 w-full bg-gradient-to-r from-transparent ${via} to-transparent animate-pulse`} />
      <CardContent className="p-6 space-y-4">
        <div className="flex items-center gap-2 text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" />
          <span className="text-sm font-mono">Analyzing with AI…</span>
        </div>
        <Skeleton className="h-4 w-full" />
        <Skeleton className="h-4 w-5/6" />
        <Skeleton className="h-4 w-2/3" />
      </CardContent>
    </Card>
  );
}

function EmptyAnalysis({
  color, label, description, onAnalyze,
}: { color: string; label: string; description: string; onAnalyze: () => void }) {
  const btnClass = color === "emerald"
    ? "border-emerald-500/40 bg-emerald-500/10 text-emerald-300 hover:bg-emerald-500/20"
    : "border-amber-500/40 bg-amber-500/10 text-amber-300 hover:bg-amber-500/20";
  return (
    <Card className={`border-${color}-500/20`}>
      <CardContent className="p-8 flex flex-col items-center gap-3 text-center">
        {color === "emerald"
          ? <TrendingUp className="h-8 w-8 text-emerald-400/40" />
          : <BarChart2 className="h-8 w-8 text-amber-400/40" />}
        <h3 className="font-semibold text-base">{label}</h3>
        <p className="text-sm text-muted-foreground max-w-sm">{description}</p>
        <Button
          onClick={onAnalyze}
          className={`mt-2 font-mono text-sm border ${btnClass} bg-transparent shadow-none`}
          variant="outline"
        >
          <Sparkles className="mr-2 h-4 w-4" /> Run {label}
        </Button>
      </CardContent>
    </Card>
  );
}

function SentimentBadge({ sentiment }: { sentiment: string }) {
  return (
    <Badge
      variant={sentiment === "bullish" ? "default" : sentiment === "bearish" ? "destructive" : "secondary"}
      className="font-mono uppercase"
    >
      {sentiment}
    </Badge>
  );
}

function StrengthRiskList({ title, items, type }: { title: string; items: string[]; type: "strength" | "risk" }) {
  const icon = type === "strength" ? <TrendingUp className="h-4 w-4 text-chart-2" /> : <TrendingDown className="h-4 w-4 text-destructive" />;
  const marker = type === "strength" ? <span className="text-chart-2 mt-0.5">+</span> : <span className="text-destructive mt-0.5">−</span>;
  return (
    <div className="space-y-2">
      <h4 className="font-bold text-sm flex items-center gap-2">{icon} {title}</h4>
      <ul className="space-y-1.5">
        {items.map((s, i) => (
          <li key={i} className="text-sm flex items-start gap-2">{marker}{s}</li>
        ))}
      </ul>
    </div>
  );
}

function OutlookBlock({ title, text }: { title: string; text: string }) {
  return (
    <div>
      <h4 className="font-bold mb-1.5 text-xs text-muted-foreground uppercase tracking-wider">{title}</h4>
      <p className="text-sm">{text}</p>
    </div>
  );
}

function LevelCard({ label, value, color }: { label: string; value: string | number | null; color: string }) {
  return (
    <div className="rounded-md border border-border bg-card/60 px-3 py-2.5">
      <p className="text-xs text-muted-foreground uppercase tracking-wider mb-0.5">{label}</p>
      <p className={`font-mono font-bold text-sm ${color}`}>{value ?? "—"}</p>
    </div>
  );
}

/* ─── Signal Confidence Score Widget ────────────────────────── */

function ScoreGauge({ score }: { score: number }) {
  const radius = 38;
  const circ   = 2 * Math.PI * radius;
  const dash   = (score / 100) * circ;
  const color  = score >= 70 ? "#10b981" : score >= 50 ? "#3b82f6" : score >= 35 ? "#f59e0b" : "#ef4444";
  const trackColor = "rgba(255,255,255,0.06)";
  return (
    <svg width="100" height="100" viewBox="0 0 100 100" className="shrink-0">
      <circle cx="50" cy="50" r={radius} fill="none" stroke={trackColor} strokeWidth="9" />
      <circle
        cx="50" cy="50" r={radius} fill="none"
        stroke={color} strokeWidth="9"
        strokeDasharray={`${dash} ${circ}`}
        strokeLinecap="round"
        transform="rotate(-90 50 50)"
        style={{ transition: "stroke-dasharray 0.6s ease" }}
      />
      <text x="50" y="47" textAnchor="middle" dominantBaseline="middle"
        fill="white" fontSize="20" fontWeight="700" fontFamily="monospace">{score}</text>
      <text x="50" y="63" textAnchor="middle" dominantBaseline="middle"
        fill="rgba(255,255,255,0.45)" fontSize="8" fontFamily="monospace">/ 100</text>
    </svg>
  );
}

const COLOR_MAP: Record<string, { bar: string; text: string; badge: string }> = {
  emerald: { bar: "bg-emerald-500", text: "text-emerald-400", badge: "bg-emerald-500/15 text-emerald-300 border-emerald-500/30" },
  blue:    { bar: "bg-blue-500",    text: "text-blue-400",    badge: "bg-blue-500/15 text-blue-300 border-blue-500/30"       },
  amber:   { bar: "bg-amber-500",   text: "text-amber-400",   badge: "bg-amber-500/15 text-amber-300 border-amber-500/30"    },
  red:     { bar: "bg-red-500",     text: "text-red-400",     badge: "bg-red-500/15 text-red-300 border-red-500/30"          },
};

const ACTION_STYLE: Record<string, string> = {
  buy:   "bg-emerald-500/15 text-emerald-300 border border-emerald-500/40",
  watch: "bg-blue-500/15 text-blue-300 border border-blue-500/40",
  skip:  "bg-red-500/15 text-red-400 border border-red-500/40",
};
const ACTION_LABEL: Record<string, string> = { buy: "BUY SIGNAL", watch: "WATCH", skip: "SKIP" };

function ConfidenceWidget({ data, isLoading }: { data: ConfidenceData | undefined; isLoading: boolean }) {
  if (isLoading) {
    return (
      <Card className="border-border/60">
        <CardContent className="p-5">
          <div className="flex items-center gap-3 text-muted-foreground mb-4">
            <ShieldAlert className="h-4 w-4 animate-pulse" />
            <span className="text-sm font-mono">Computing signal confidence…</span>
          </div>
          <div className="flex gap-6">
            <Skeleton className="w-[100px] h-[100px] rounded-full shrink-0" />
            <div className="flex-1 space-y-4 pt-2">
              <Skeleton className="h-3 w-full" />
              <Skeleton className="h-3 w-5/6" />
              <Skeleton className="h-3 w-4/6" />
            </div>
          </div>
        </CardContent>
      </Card>
    );
  }
  if (!data) return null;

  const verdictColors = COLOR_MAP[data.verdictColor] ?? COLOR_MAP.amber;

  return (
    <Card className="border-border/70 overflow-hidden">
      {/* thin top accent stripe */}
      <div className={`h-[3px] w-full ${verdictColors.bar} opacity-60`} />
      <CardContent className="p-5">
        <div className="flex flex-col sm:flex-row gap-5">

          {/* Left: gauge + action */}
          <div className="flex flex-col items-center gap-2 shrink-0">
            <ScoreGauge score={data.overall} />
            <span className={`text-xs font-bold font-mono px-2.5 py-1 rounded ${ACTION_STYLE[data.action]}`}>
              {ACTION_LABEL[data.action]}
            </span>
          </div>

          {/* Right: factors */}
          <div className="flex-1 flex flex-col gap-1">
            <div className="flex items-center gap-2 mb-2">
              <ShieldAlert className="h-4 w-4 text-muted-foreground" />
              <span className="text-sm font-bold font-mono tracking-wide">Signal Confidence</span>
              <span className={`ml-auto text-xs font-semibold ${verdictColors.text}`}>{data.verdict}</span>
            </div>

            {data.factors.map((f) => {
              const fc = COLOR_MAP[f.color] ?? COLOR_MAP.amber;
              const displayScore = f.isRisk ? 100 - f.score : f.score;
              const barPct = f.isRisk ? 100 - f.score : f.score;
              return (
                <div key={f.name} className="mb-1.5">
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-xs text-muted-foreground font-mono uppercase tracking-wider">{f.name}</span>
                    <span className={`text-xs font-bold font-mono ${fc.text}`}>{displayScore}</span>
                  </div>
                  <div className="h-1.5 w-full rounded-full bg-white/5">
                    <div
                      className={`h-full rounded-full ${fc.bar} transition-all duration-700`}
                      style={{ width: `${barPct}%` }}
                    />
                  </div>
                  <p className="text-xs text-muted-foreground mt-0.5 leading-relaxed">{f.verdict}</p>
                </div>
              );
            })}
          </div>
        </div>

        {/* Raw detail row */}
        <div className="mt-4 pt-3 border-t border-border/40 flex flex-wrap gap-x-5 gap-y-1">
          {data.factors.map((f) => (
            <span key={f.name} className="text-xs text-muted-foreground/60 font-mono">{f.detail}</span>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}
