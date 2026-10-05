import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useGetSectorNews, useGetMarketSummary } from "@workspace/api-client-react";
import type { GetSectorNewsSector } from "@workspace/api-client-react";
import { Layout } from "@/components/layout";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import {
  Newspaper, TrendingUp, Zap, ArrowUpRight, ArrowDownRight,
  Cpu, Flame, HeartPulse, Landmark, ShoppingCart, Factory, Globe, ExternalLink,
  CalendarDays, ChevronDown, ChevronUp,
} from "lucide-react";
import { formatDistanceToNow, format, isToday, isTomorrow, parseISO } from "date-fns";

const BASE = import.meta.env.BASE_URL.replace(/\/$/, "");

/* ── Economic Calendar types ───────────────────────────────── */
interface EconEvent {
  event:    string;
  label:    string;
  plain:    string;
  date:     string;
  time:     string;
  impact:   "high" | "medium" | "low";
  actual:   number | null;
  forecast: number | null;
  previous: number | null;
  unit:     string;
}

interface CalendarResponse {
  events:      EconEvent[];
  generatedAt: string;
  available?:  boolean;
}

/* ── Impact config ─────────────────────────────────────────── */
const IMPACT_CFG = {
  high:   { color: "text-red-400",   bg: "bg-red-500/15",   border: "border-red-500/30",   dot: "bg-red-500",   label: "High Impact"   },
  medium: { color: "text-amber-400", bg: "bg-amber-500/15", border: "border-amber-500/30", dot: "bg-amber-500", label: "Medium Impact" },
  low:    { color: "text-slate-400", bg: "bg-slate-500/10", border: "border-slate-500/20", dot: "bg-slate-500", label: "Low Impact"    },
} as const;

function dayLabel(dateStr: string): string {
  try {
    const d = parseISO(dateStr);
    if (isToday(d))    return "Today";
    if (isTomorrow(d)) return "Tomorrow";
    return format(d, "EEEE, MMM d");
  } catch { return dateStr; }
}

function fmtVal(val: number | null, unit: string): string {
  if (val === null || val === undefined) return "—";
  const num = typeof val === "number" ? val.toLocaleString() : val;
  return unit ? `${num}${unit}` : String(num);
}

/* ── Single event row ──────────────────────────────────────── */
function EconEventRow({ ev, defaultOpen }: { ev: EconEvent; defaultOpen?: boolean }) {
  const [open, setOpen] = useState(defaultOpen ?? false);
  const cfg  = IMPACT_CFG[ev.impact] ?? IMPACT_CFG.low;
  const beat = ev.actual !== null && ev.forecast !== null
    ? ev.actual > ev.forecast ? "beat" : ev.actual < ev.forecast ? "miss" : "inline"
    : null;

  return (
    <div className={`rounded-lg border ${cfg.border} overflow-hidden`}>
      <button
        onClick={() => setOpen(o => !o)}
        className="w-full flex items-center gap-2.5 px-3 py-2.5 text-left hover:bg-accent/10 transition-colors"
      >
        {/* Impact dot */}
        <span className={`h-2 w-2 rounded-full shrink-0 ${cfg.dot}`} />

        {/* Time */}
        {ev.time && (
          <span className="text-[10px] font-mono text-muted-foreground shrink-0 w-10">{ev.time}</span>
        )}

        {/* Label */}
        <span className="text-xs font-semibold flex-1 leading-tight">{ev.label}</span>

        {/* Actual badge if released */}
        {ev.actual !== null && (
          <span className={`text-[10px] font-mono font-bold px-1.5 py-0.5 rounded shrink-0 ${
            beat === "beat" ? "bg-emerald-500/20 text-emerald-400"
            : beat === "miss" ? "bg-red-500/20 text-red-400"
            : "bg-muted/40 text-muted-foreground"
          }`}>
            {fmtVal(ev.actual, ev.unit)}
          </span>
        )}

        {open ? <ChevronUp className="h-3 w-3 text-muted-foreground shrink-0" />
               : <ChevronDown className="h-3 w-3 text-muted-foreground shrink-0" />}
      </button>

      {open && (
        <div className={`px-3 pb-3 space-y-2 ${cfg.bg}`}>
          {/* Plain-English explanation */}
          {ev.plain && (
            <p className="text-[11px] text-muted-foreground leading-relaxed">{ev.plain}</p>
          )}
          {/* Numbers row */}
          <div className="flex gap-3 flex-wrap">
            {ev.forecast !== null && (
              <div className="text-[10px] font-mono">
                <span className="text-muted-foreground">Expected: </span>
                <span className="text-foreground font-bold">{fmtVal(ev.forecast, ev.unit)}</span>
              </div>
            )}
            {ev.previous !== null && (
              <div className="text-[10px] font-mono">
                <span className="text-muted-foreground">Previous: </span>
                <span className="text-foreground font-bold">{fmtVal(ev.previous, ev.unit)}</span>
              </div>
            )}
            {ev.actual !== null && (
              <div className="text-[10px] font-mono">
                <span className="text-muted-foreground">Actual: </span>
                <span className={`font-bold ${
                  beat === "beat" ? "text-emerald-400"
                  : beat === "miss" ? "text-red-400"
                  : "text-foreground"
                }`}>{fmtVal(ev.actual, ev.unit)}</span>
              </div>
            )}
          </div>
          {/* Beat/miss note */}
          {beat && beat !== "inline" && ev.actual !== null && (
            <p className={`text-[10px] font-mono font-bold ${beat === "beat" ? "text-emerald-400" : "text-red-400"}`}>
              {beat === "beat" ? "✓ Beat expectations — usually bullish" : "✗ Missed expectations — usually bearish"}
            </p>
          )}
        </div>
      )}
    </div>
  );
}

/* ── Economic Calendar sidebar ─────────────────────────────── */
function EconomicCalendar() {
  const { data, isLoading, error } = useQuery<CalendarResponse>({
    queryKey: ["economic-calendar"],
    queryFn:  async () => {
      const res = await fetch(`${BASE}/api/economic-calendar`);
      if (!res.ok) throw new Error("Failed to load calendar");
      return res.json();
    },
    staleTime: 25 * 60 * 1000,
  });

  /* Group by date */
  const byDate: Record<string, EconEvent[]> = {};
  for (const ev of data?.events ?? []) {
    if (!byDate[ev.date]) byDate[ev.date] = [];
    byDate[ev.date].push(ev);
  }
  const sortedDates = Object.keys(byDate).sort();

  /* Only show high+medium by default, but keep all in state */
  const [showLow, setShowLow] = useState(false);

  return (
    <div className="rounded-xl border border-border/60 bg-card overflow-hidden flex flex-col">
      {/* Header */}
      <div className="flex flex-col px-4 py-3 border-b border-border/60 bg-muted/20 gap-2">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <CalendarDays className="h-4 w-4 text-primary" />
            <span className="text-sm font-bold font-mono">Economic Calendar</span>
          </div>
          <div className="flex items-center gap-2">
            <span className="flex items-center gap-1 text-[10px] font-mono text-muted-foreground">
              <span className="h-1.5 w-1.5 rounded-full bg-red-500" />High
            </span>
            <span className="flex items-center gap-1 text-[10px] font-mono text-muted-foreground">
              <span className="h-1.5 w-1.5 rounded-full bg-amber-500" />Med
            </span>
          </div>
        </div>
        <p className="text-[10px] text-muted-foreground leading-relaxed">
          <span className="text-red-400 font-bold">Red</span> = moves markets instantly (jobs, Fed, inflation) &nbsp;·&nbsp; <span className="text-amber-400 font-bold">Amber</span> = notable but smaller effect
        </p>
      </div>

      <div className="flex-1 overflow-y-auto max-h-[680px] p-3 space-y-4">
        {isLoading && (
          <div className="space-y-2">
            {Array.from({ length: 8 }).map((_, i) => (
              <div key={i} className="h-10 rounded-lg bg-muted/30 animate-pulse" />
            ))}
          </div>
        )}

        {error && (
          <p className="text-xs text-red-400 font-mono text-center py-4">
            Could not load calendar
          </p>
        )}

        {!isLoading && !error && data?.available === false && (
          <p className="text-xs text-muted-foreground text-center py-6 font-mono">
            Calendar data is unavailable until Finnhub is configured
          </p>
        )}

        {!isLoading && !error && data?.available !== false && sortedDates.length === 0 && (
          <p className="text-xs text-muted-foreground text-center py-6 font-mono">
            No upcoming events found
          </p>
        )}

        {sortedDates.map(date => {
          const evs = byDate[date];
          const visible = showLow ? evs : evs.filter(e => e.impact !== "low");
          if (visible.length === 0) return null;
          return (
            <div key={date} className="space-y-1.5">
              <div className="flex items-center gap-2">
                <span className={`text-[11px] font-bold font-mono ${isToday(parseISO(date)) ? "text-primary" : "text-muted-foreground"}`}>
                  {dayLabel(date)}
                </span>
                <div className="flex-1 h-px bg-border/40" />
              </div>
              {visible.map((ev, i) => (
                <EconEventRow key={i} ev={ev} defaultOpen={isToday(parseISO(date)) && ev.impact === "high"} />
              ))}
            </div>
          );
        })}

        {/* Toggle low-impact */}
        {!isLoading && (data?.events ?? []).some(e => e.impact === "low") && (
          <button
            onClick={() => setShowLow(s => !s)}
            className="w-full text-[10px] font-mono text-muted-foreground hover:text-foreground py-2 border border-dashed border-border/40 rounded-lg transition-colors"
          >
            {showLow ? "Hide low-impact events" : "Show all events (incl. low-impact)"}
          </button>
        )}
      </div>
    </div>
  );
}

/* ── Sector config ─────────────────────────────────────────── */
const SECTORS = [
  { id: "all",        label: "All Markets",  icon: Globe,         etf: "SPY" },
  { id: "tech",       label: "Technology",   icon: Cpu,           etf: "XLK" },
  { id: "energy",     label: "Energy",       icon: Flame,         etf: "XLE" },
  { id: "health",     label: "Healthcare",   icon: HeartPulse,    etf: "XLV" },
  { id: "finance",    label: "Financials",   icon: Landmark,      etf: "XLF" },
  { id: "consumer",   label: "Consumer",     icon: ShoppingCart,  etf: "XLY" },
  { id: "industrial", label: "Industrials",  icon: Factory,       etf: "XLI" },
];

/* ── Sentiment heat colour helper ──────────────────────────── */
function sentimentStyle(chg: number | undefined, active: boolean) {
  if (chg === undefined) return {};
  const abs = Math.min(Math.abs(chg), 3);          // cap at 3 % for colour scaling
  const intensity = abs / 3;                       // 0–1

  if (active) return {};                           // active tab keeps its own colour

  if (chg > 0) {
    const g = Math.round(80 + intensity * 140);   // 80–220
    return {
      borderColor: `rgba(78,222,163,${0.15 + intensity * 0.45})`,
      background:  `rgba(${20 + Math.round(intensity * 15)},${g},${80 + Math.round(intensity * 30)},${0.06 + intensity * 0.10})`,
    };
  } else {
    const r = Math.round(120 + intensity * 135);  // 120–255
    return {
      borderColor: `rgba(255,84,81,${0.15 + intensity * 0.45})`,
      background:  `rgba(${r},${30 + Math.round(intensity * 20)},${30 + Math.round(intensity * 20)},${0.06 + intensity * 0.10})`,
    };
  }
}

/* ── Curated fallback images per sector (Unsplash, always available) ── */
const FALLBACKS: Record<string, string[]> = {
  all: [
    "https://images.unsplash.com/photo-1611974789855-9c2a0a7236a3?w=900&q=80",
    "https://images.unsplash.com/photo-1590283603385-17ffb3a7f29f?w=900&q=80",
    "https://images.unsplash.com/photo-1559526324-4b87b5e36e44?w=900&q=80",
    "https://images.unsplash.com/photo-1642790551116-18e150f248e3?w=900&q=80",
    "https://images.unsplash.com/photo-1543286386-713bdd548da4?w=900&q=80",
    "https://images.unsplash.com/photo-1563986768494-4dee2763ff3f?w=900&q=80",
    "https://images.unsplash.com/photo-1551288049-bebda4e38f71?w=900&q=80",
    "https://images.unsplash.com/photo-1507679799987-c73779587ccf?w=900&q=80",
    "https://images.unsplash.com/photo-1460925895917-afdab827c52f?w=900&q=80",
  ],
  tech: [
    "https://images.unsplash.com/photo-1518770660439-4636190af475?w=900&q=80",
    "https://images.unsplash.com/photo-1526374965328-7f61d4dc18c5?w=900&q=80",
    "https://images.unsplash.com/photo-1550751827-4bd374c3f58b?w=900&q=80",
    "https://images.unsplash.com/photo-1677442135703-1787eea5ce01?w=900&q=80",
    "https://images.unsplash.com/photo-1486312338219-ce68d2c6f44d?w=900&q=80",
    "https://images.unsplash.com/photo-1504384308090-c894fdcc538d?w=900&q=80",
    "https://images.unsplash.com/photo-1531297484001-80022131f5a1?w=900&q=80",
  ],
  energy: [
    "https://images.unsplash.com/photo-1473341304170-971dccb5ac1e?w=900&q=80",
    "https://images.unsplash.com/photo-1509391366360-2e959784a276?w=900&q=80",
    "https://images.unsplash.com/photo-1497435334941-8c899ee9e8e9?w=900&q=80",
    "https://images.unsplash.com/photo-1466611653911-95081537e5b7?w=900&q=80",
    "https://images.unsplash.com/photo-1587613864521-9ef8dfe617cc?w=900&q=80",
  ],
  health: [
    "https://images.unsplash.com/photo-1559757148-5c350d0d3c56?w=900&q=80",
    "https://images.unsplash.com/photo-1576671081837-49000212a03f?w=900&q=80",
    "https://images.unsplash.com/photo-1584308666744-24d5c474f2ae?w=900&q=80",
    "https://images.unsplash.com/photo-1532938911079-1b06ac7ceec7?w=900&q=80",
    "https://images.unsplash.com/photo-1582750433449-648ed127bb54?w=900&q=80",
  ],
  finance: [
    "https://images.unsplash.com/photo-1601597111158-2fceff292cdc?w=900&q=80",
    "https://images.unsplash.com/photo-1454165804606-c3d57bc86b40?w=900&q=80",
    "https://images.unsplash.com/photo-1444653614773-995cb1ef9efa?w=900&q=80",
    "https://images.unsplash.com/photo-1559067096-49ebca3406aa?w=900&q=80",
    "https://images.unsplash.com/photo-1638913662252-70efce1e60a7?w=900&q=80",
  ],
  consumer: [
    "https://images.unsplash.com/photo-1472851294608-062f824d29cc?w=900&q=80",
    "https://images.unsplash.com/photo-1556742049-0cfed4f6a45d?w=900&q=80",
    "https://images.unsplash.com/photo-1483985988355-763728e1935b?w=900&q=80",
    "https://images.unsplash.com/photo-1607082348824-0a96f2a4b9da?w=900&q=80",
  ],
  industrial: [
    "https://images.unsplash.com/photo-1581091226825-a6a2a5aee158?w=900&q=80",
    "https://images.unsplash.com/photo-1565726073-fa99bb3e7c08?w=900&q=80",
    "https://images.unsplash.com/photo-1504328345606-18bbc8c9d7d1?w=900&q=80",
    "https://images.unsplash.com/photo-1533106418989-88406c7cc8ca?w=900&q=80",
  ],
};

function getImage(thumbnail: string | null | undefined, sector: string, index: number): string {
  if (thumbnail) return thumbnail;
  const pool = FALLBACKS[sector] ?? FALLBACKS.all;
  return pool[index % pool.length];
}

function timeAgo(iso: string) {
  try { return formatDistanceToNow(new Date(iso), { addSuffix: true }); }
  catch { return ""; }
}

/* ── Hero card ─────────────────────────────────────────────── */
function HeroCard({ article, sector }: { article: any; sector: string }) {
  const img = getImage(article.thumbnail, sector, 0);
  return (
    <a href={article.link} target="_blank" rel="noopener noreferrer" className="group block">
      <div className="relative w-full rounded-xl overflow-hidden h-[380px] md:h-[440px]">
        <img
          src={img}
          alt=""
          className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-105"
          onError={(e) => {
            const t = e.target as HTMLImageElement;
            t.src = FALLBACKS.all[0];
          }}
        />
        {/* dark gradient overlay */}
        <div className="absolute inset-0 bg-gradient-to-t from-black/90 via-black/40 to-transparent" />

        {/* Content overlay */}
        <div className="absolute bottom-0 left-0 right-0 p-6 md:p-8">
          <div className="flex items-center gap-2 mb-3">
            <Badge className="bg-primary/90 text-primary-foreground text-xs font-mono uppercase tracking-wider border-0">
              Top Story
            </Badge>
            <span className="text-xs text-white/60 font-mono">{article.publisher}</span>
            <span className="text-xs text-white/40">·</span>
            <span className="text-xs text-white/60">{timeAgo(article.publishedAt)}</span>
          </div>
          <h2 className="text-xl md:text-3xl font-bold text-white leading-snug group-hover:text-primary transition-colors line-clamp-3">
            {article.title}
          </h2>
          <div className="flex items-center gap-1.5 mt-3 text-white/50 text-xs group-hover:text-white/70 transition-colors">
            <ExternalLink className="h-3 w-3" />
            <span>Read full story</span>
          </div>
        </div>
      </div>
    </a>
  );
}

/* ── Featured card (2-col row) ─────────────────────────────── */
function FeaturedCard({ article, sector, index }: { article: any; sector: string; index: number }) {
  const img = getImage(article.thumbnail, sector, index);
  return (
    <a href={article.link} target="_blank" rel="noopener noreferrer" className="group block h-full">
      <div className="rounded-xl overflow-hidden flex flex-col" style={{ border: "1px solid rgba(255,255,255,0.07)" }}>
        {/* Photo on top */}
        <div className="relative h-[200px] overflow-hidden shrink-0">
          <img
            src={img}
            alt=""
            className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-105"
            onError={(e) => { (e.target as HTMLImageElement).src = FALLBACKS.all[index % FALLBACKS.all.length]; }}
          />
          <div className="absolute inset-0 bg-gradient-to-t from-black/50 to-transparent" />
          <div className="absolute top-2 left-2">
            <span className="text-[10px] text-white/80 font-mono bg-black/50 backdrop-blur-sm px-1.5 py-0.5 rounded">
              {article.publisher}
            </span>
          </div>
        </div>
        {/* Text below */}
        <div className="p-4 flex flex-col gap-2" style={{ background: "rgba(14,14,18,0.95)" }}>
          <h3 className="text-sm font-bold text-white leading-snug group-hover:text-primary transition-colors line-clamp-2">
            {article.title}
          </h3>
          {article.summary && (
            <p className="text-[11px] text-slate-400 leading-relaxed line-clamp-3">
              {article.summary}
            </p>
          )}
          <p className="text-[10px] text-white/30 font-mono mt-1">{timeAgo(article.publishedAt)}</p>
        </div>
      </div>
    </a>
  );
}

/* ── Small grid card ───────────────────────────────────────── */
function ArticleCard({ article, sector, index }: { article: any; sector: string; index: number }) {
  const img = getImage(article.thumbnail, sector, index);
  return (
    <a href={article.link} target="_blank" rel="noopener noreferrer" className="group block h-full">
      <Card className="h-full overflow-hidden hover:border-primary/40 transition-all duration-200 hover:shadow-lg hover:shadow-primary/5 flex flex-col">
        {/* Photo on top */}
        <div className="relative h-44 overflow-hidden shrink-0">
          <img
            src={img}
            alt=""
            className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-105"
            onError={(e) => { (e.target as HTMLImageElement).src = FALLBACKS.all[index % FALLBACKS.all.length]; }}
          />
          <div className="absolute inset-0 bg-gradient-to-t from-black/40 to-transparent" />
          <div className="absolute top-2 left-2">
            <span className="text-[10px] text-white/80 font-mono bg-black/50 backdrop-blur-sm px-1.5 py-0.5 rounded">
              {article.publisher}
            </span>
          </div>
        </div>
        <CardContent className="p-3 flex flex-col gap-2 flex-1">
          <h3 className="text-sm font-bold leading-snug group-hover:text-primary transition-colors line-clamp-2">
            {article.title}
          </h3>
          {article.summary && (
            <p className="text-[11px] text-muted-foreground leading-relaxed line-clamp-3 flex-1">
              {article.summary}
            </p>
          )}
          <div className="flex items-center justify-between mt-auto pt-1">
            <p className="text-[10px] text-muted-foreground/60 font-mono">{timeAgo(article.publishedAt)}</p>
            <ExternalLink className="h-3 w-3 text-muted-foreground/40 group-hover:text-primary/60 transition-colors" />
          </div>
        </CardContent>
      </Card>
    </a>
  );
}

/* ── Skeleton loaders ──────────────────────────────────────── */
function NewsSkeletons() {
  return (
    <div className="flex flex-col gap-6">
      <Skeleton className="w-full h-[380px] rounded-xl" />
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <Skeleton className="h-[220px] rounded-xl" />
        <Skeleton className="h-[220px] rounded-xl" />
      </div>
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {[...Array(6)].map((_, i) => (
          <Card key={i}>
            <Skeleton className="h-40 rounded-t-lg rounded-b-none" />
            <CardContent className="p-3 space-y-2">
              <Skeleton className="h-4 w-full" />
              <Skeleton className="h-4 w-3/4" />
              <Skeleton className="h-3 w-1/3" />
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}

/* ── Main page ─────────────────────────────────────────────── */
export function NewsPage() {
  const [sector, setSector] = useState<GetSectorNewsSector>("all");

  const { data: summary, isLoading: summaryLoading } = useGetMarketSummary();
  const { data: news, isLoading: newsLoading } = useGetSectorNews(
    { sector },
    { query: { queryKey: ["sector-news", sector] } }
  );

  const { data: sentiment } = useQuery<Record<string, { etf: string; changePercent: number; price: number }>>({
    queryKey: ["sector-sentiment"],
    queryFn: async () => {
      const res = await fetch(`${BASE}/api/sector-sentiment`);
      if (!res.ok) throw new Error("sentiment failed");
      return res.json();
    },
    staleTime: 5 * 60 * 1000,
  });

  const articles = news?.articles ?? [];

  return (
    <Layout>
      <div className="flex flex-col gap-6">

        {/* ── Header ───────────────────────────────────────── */}
        <div className="flex items-start justify-between gap-4 flex-wrap">
          <div className="flex items-center gap-3">
            <Newspaper className="h-7 w-7 text-primary" />
            <div>
              <h1 className="text-2xl font-bold font-mono">Market News</h1>
              <p className="text-sm text-muted-foreground">Live headlines · sector intelligence · AI brief</p>
            </div>
          </div>

          {/* Index bar */}
          {!summaryLoading && summary?.indices && (
            <div className="flex gap-2 flex-wrap">
              {summary.indices.map((idx) => {
                const up = idx.changePercent >= 0;
                return (
                  <div
                    key={idx.symbol}
                    className={`flex flex-col px-3 py-1.5 rounded-lg border text-right ${up ? "border-emerald-500/20 bg-emerald-500/5" : "border-red-500/20 bg-red-500/5"}`}
                  >
                    <div className="flex items-center gap-1.5 justify-between">
                      <span className="font-mono font-bold text-xs">{idx.symbol}</span>
                      <span className={`font-mono text-xs font-bold flex items-center gap-0.5 ${up ? "text-emerald-400" : "text-red-400"}`}>
                        {up ? <ArrowUpRight className="h-3 w-3" /> : <ArrowDownRight className="h-3 w-3" />}
                        {up ? "+" : ""}{idx.changePercent.toFixed(2)}%
                      </span>
                    </div>
                    <span className="font-mono text-sm font-semibold">${idx.price.toFixed(2)}</span>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* ── AI Market Brief ──────────────────────────────── */}
        {!summaryLoading && summary?.summary && (
          <div className="rounded-xl border border-primary/20 bg-primary/5 px-5 py-4 flex gap-3">
            <Zap className="h-4 w-4 text-primary shrink-0 mt-0.5" />
            <div>
              <span className="text-xs font-bold uppercase tracking-wider text-primary font-mono">AI Market Brief</span>
              <p className="text-sm leading-relaxed text-foreground/90 mt-1">{summary.summary}</p>
            </div>
            {summary.generatedAt && (
              <span className="text-xs text-muted-foreground shrink-0 ml-auto self-start">
                {timeAgo(summary.generatedAt)}
              </span>
            )}
          </div>
        )}

        {/* ── Sector Tabs with sentiment heatmap ───────────── */}
        <div className="flex flex-col gap-2">
          <div className="flex gap-1.5 flex-wrap">
            {SECTORS.map(({ id, label, icon: Icon }) => {
              const s = sentiment?.[id];
              const chg = s?.changePercent;
              const active = sector === id;
              const up = chg !== undefined ? chg >= 0 : null;
              return (
                <button
                  key={id}
                  onClick={() => setSector(id as GetSectorNewsSector)}
                  style={sentimentStyle(chg, active)}
                  className={`group relative flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm font-medium font-mono transition-all border ${
                    active
                      ? "bg-primary/10 border-primary/40 text-primary shadow-sm"
                      : "border-border text-muted-foreground hover:border-primary/30 hover:text-foreground"
                  }`}
                >
                  <Icon className="h-3.5 w-3.5 shrink-0" />
                  <span>{label}</span>
                  {chg !== undefined && (
                    <span className={`text-[10px] font-mono font-bold ml-0.5 tabular-nums ${
                      active ? "text-primary/70" : up ? "text-emerald-400" : "text-red-400"
                    }`}>
                      {up ? "+" : ""}{chg.toFixed(2)}%
                    </span>
                  )}
                  {/* ETF label on hover */}
                  {s && (
                    <span className="absolute -top-5 left-1/2 -translate-x-1/2 text-[9px] font-mono text-muted-foreground/60 opacity-0 group-hover:opacity-100 transition-opacity whitespace-nowrap pointer-events-none">
                      {s.etf} ${s.price.toFixed(2)}
                    </span>
                  )}
                </button>
              );
            })}
          </div>
          {/* Mini heat bar — visual at-a-glance strip */}
          {sentiment && (
            <div className="flex gap-1.5">
              {SECTORS.map(({ id }) => {
                const chg = sentiment[id]?.changePercent ?? 0;
                const abs = Math.min(Math.abs(chg), 3) / 3;
                const up = chg >= 0;
                return (
                  <div
                    key={id}
                    title={`${id}: ${chg >= 0 ? "+" : ""}${chg.toFixed(2)}%`}
                    onClick={() => setSector(id as GetSectorNewsSector)}
                    className="h-1 flex-1 rounded-full cursor-pointer transition-all hover:scale-y-150"
                    style={{
                      background: up
                        ? `rgba(78,222,163,${0.2 + abs * 0.8})`
                        : `rgba(255,84,81,${0.2 + abs * 0.8})`,
                    }}
                  />
                );
              })}
            </div>
          )}
        </div>

        {/* ── News Layout ───────────────────────────────────── */}
        <div className={`flex gap-6 items-start ${sector === "all" ? "flex-col xl:flex-row" : ""}`}>

          {/* Main news column */}
          <div className="flex-1 min-w-0">
            {newsLoading ? (
              <NewsSkeletons />
            ) : articles.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-20 gap-3 text-center text-muted-foreground">
                <Newspaper className="h-10 w-10 opacity-20" />
                <p>No news found for this sector right now.</p>
              </div>
            ) : (
              <div className="flex flex-col gap-6">

                {/* Hero — first article */}
                {articles[0] && <HeroCard article={articles[0]} sector={sector} />}

                {/* Featured row — articles 2 & 3 */}
                {articles.slice(1, 3).length > 0 && (
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    {articles.slice(1, 3).map((article, i) => (
                      <FeaturedCard key={i} article={article} sector={sector} index={i + 1} />
                    ))}
                  </div>
                )}

                {/* Trending label */}
                {articles.length > 3 && (
                  <div className="flex items-center gap-2">
                    <TrendingUp className="h-4 w-4 text-muted-foreground" />
                    <span className="text-xs font-bold uppercase tracking-wider text-muted-foreground font-mono">More Stories</span>
                    <div className="flex-1 h-px bg-border" />
                  </div>
                )}

                {/* Grid — remaining articles */}
                {articles.length > 3 && (
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                    {articles.slice(3).map((article, i) => (
                      <ArticleCard key={i} article={article} sector={sector} index={i + 3} />
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Economic Calendar sidebar — only on All Markets */}
          {sector === "all" && (
            <div className="w-full xl:w-80 shrink-0">
              <EconomicCalendar />
            </div>
          )}
        </div>

      </div>
    </Layout>
  );
}
