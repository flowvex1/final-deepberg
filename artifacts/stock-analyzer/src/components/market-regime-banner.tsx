import { useQuery } from "@tanstack/react-query";
import { Skeleton } from "@/components/ui/skeleton";
import {
  TrendingUp, Minus, AlertTriangle, BarChart3,
  Lightbulb, ArrowUp, ArrowDown, Activity, Crosshair,
} from "lucide-react";

const BASE = import.meta.env.BASE_URL.replace(/\/$/, "");

type Regime   = "trend" | "chop" | "panic" | "earnings";
type Quadrant = "prime" | "high-stakes" | "patient" | "danger";

interface RegimeResult {
  regime:           Regime;
  label:            string;
  confidence:       number;
  opportunityScore: number;
  riskScore:        number;
  quadrant:         Quadrant;
  quadrantLabel:    string;
  scores:           Record<Regime, number>;
  signals: {
    vix:              number;
    vixChange:        number;
    spyMove:          number;
    spyDirection:     string;
    directionalRatio: number;
    volumeRatio:      number;
    sectorDispersion: number;
    sectorMax:        number;
    sectorMin:        number;
    sectorBest:       string;
    sectorWorst:      string;
  };
  description: string;
  hints:       string[];
  color:       string;
  updatedAt:   string;
}

/* ── Regime visual config ──────────────────────────────────── */
const REGIME_CFG: Record<Regime, { icon: any; border: string; gradient: string; iconBg: string }> = {
  trend:    { icon: TrendingUp,   border: "border-emerald-500/35", gradient: "from-emerald-500/12 to-transparent", iconBg: "bg-emerald-500/20 text-emerald-300" },
  chop:     { icon: Minus,        border: "border-amber-500/35",   gradient: "from-amber-500/12 to-transparent",   iconBg: "bg-amber-500/20 text-amber-300"   },
  panic:    { icon: AlertTriangle, border: "border-red-500/35",    gradient: "from-red-500/12 to-transparent",     iconBg: "bg-red-500/20 text-red-300"       },
  earnings: { icon: BarChart3,    border: "border-blue-500/35",    gradient: "from-blue-500/12 to-transparent",    iconBg: "bg-blue-500/20 text-blue-300"     },
};

/* ── Quadrant visual config ────────────────────────────────── */
const QUAD_CFG: Record<Quadrant, {
  badge: string; dot: string; ring: string;
  oppLabel: string; riskLabel: string;
}> = {
  "prime":       { badge: "bg-emerald-500/20 text-emerald-300 border-emerald-500/40", dot: "bg-emerald-400",  ring: "ring-emerald-400/30", oppLabel: "High Opportunity", riskLabel: "Low Risk"  },
  "high-stakes": { badge: "bg-amber-500/20 text-amber-300 border-amber-500/40",       dot: "bg-amber-400",    ring: "ring-amber-400/30",   oppLabel: "High Opportunity", riskLabel: "High Risk" },
  "patient":     { badge: "bg-blue-500/20 text-blue-300 border-blue-500/40",          dot: "bg-blue-400",     ring: "ring-blue-400/30",    oppLabel: "Low Opportunity",  riskLabel: "Low Risk"  },
  "danger":      { badge: "bg-red-500/20 text-red-300 border-red-500/40",             dot: "bg-red-400",      ring: "ring-red-400/30",     oppLabel: "Low Opportunity",  riskLabel: "High Risk" },
};

const REGIME_ORDER: Regime[] = ["trend", "chop", "panic", "earnings"];
const REGIME_LABELS: Record<Regime, string> = { trend: "Trend", chop: "Chop", panic: "Panic", earnings: "Earnings" };

function useMarketRegime() {
  return useQuery<RegimeResult>({
    queryKey: ["market-regime"],
    queryFn: async () => {
      const res = await fetch(`${BASE}/api/market-regime`);
      if (!res.ok) throw new Error("Failed");
      return res.json();
    },
    refetchInterval: 5 * 60_000,
    staleTime:       4 * 60_000,
  });
}

/* ── 2D Quadrant Map ───────────────────────────────────────── */
function QuadrantMap({ opp, risk, quadrant }: { opp: number; risk: number; quadrant: Quadrant }) {
  const qcfg = QUAD_CFG[quadrant];
  /* dot position: x = risk (left=low, right=high), y = opp (top=high, bottom=low) */
  const dotX = `${risk}%`;
  const dotY = `${100 - opp}%`;

  return (
    <div className="flex flex-col gap-1 shrink-0">
      <p className="text-[10px] font-mono uppercase tracking-wider text-muted-foreground text-center">Position Map</p>
      <div className="relative w-28 h-28 rounded-lg overflow-hidden border border-white/8">
        {/* Four quadrant backgrounds */}
        <div className="absolute inset-0 grid grid-cols-2 grid-rows-2">
          <div className="bg-emerald-500/8 border-b border-r border-white/6" title="Prime Setup" />
          <div className="bg-amber-500/8 border-b border-white/6" title="High Stakes" />
          <div className="bg-blue-500/8 border-r border-white/6" title="Patient Mode" />
          <div className="bg-red-500/8" title="Danger Zone" />
        </div>
        {/* Axis labels */}
        <div className="absolute top-0.5 left-0 right-0 flex justify-between px-1">
          <span className="text-[8px] text-emerald-400/60 font-mono">HIGH OPP</span>
        </div>
        <div className="absolute bottom-0.5 left-0 right-0 flex justify-between px-1">
          <span className="text-[8px] text-muted-foreground/40 font-mono">LOW OPP</span>
        </div>
        <div className="absolute left-0 top-0 bottom-0 flex flex-col justify-center items-start pl-0.5">
          <span style={{ writingMode: "vertical-lr", transform: "rotate(180deg)" }} className="text-[7px] text-muted-foreground/40 font-mono">LOW RISK</span>
        </div>
        <div className="absolute right-0 top-0 bottom-0 flex flex-col justify-center items-end pr-0.5">
          <span style={{ writingMode: "vertical-lr" }} className="text-[7px] text-red-400/50 font-mono">HIGH RISK</span>
        </div>
        {/* Crosshair lines */}
        <div className="absolute inset-0 pointer-events-none">
          <div className="absolute left-1/2 top-0 bottom-0 w-px bg-white/8" />
          <div className="absolute top-1/2 left-0 right-0 h-px bg-white/8" />
        </div>
        {/* Position dot */}
        <div
          className={`absolute w-3.5 h-3.5 rounded-full -translate-x-1/2 -translate-y-1/2 ring-4 ${qcfg.dot} ${qcfg.ring} shadow-lg`}
          style={{ left: dotX, top: dotY }}
        />
      </div>
      <p className={`text-[9px] font-mono font-bold text-center px-1.5 py-0.5 rounded border ${qcfg.badge}`}>
        {quadrant === "prime" ? "PRIME SETUP" : quadrant === "high-stakes" ? "HIGH STAKES" : quadrant === "patient" ? "PATIENT MODE" : "DANGER ZONE"}
      </p>
    </div>
  );
}

/* ── Axis score bar ────────────────────────────────────────── */
function ScoreBar({ label, value, barColor, trackColor, sublabel }: {
  label: string; value: number; barColor: string; trackColor: string; sublabel: string;
}) {
  return (
    <div className="space-y-1">
      <div className="flex items-center justify-between">
        <div className="flex items-baseline gap-1.5">
          <span className="text-xs font-bold font-mono uppercase tracking-wider text-foreground/80">{label}</span>
          <span className="text-[10px] text-muted-foreground font-mono">{sublabel}</span>
        </div>
        <span className={`text-lg font-bold font-mono tabular-nums ${barColor.replace("bg-", "text-").split("/")[0]}`}>
          {value}
          <span className="text-xs text-muted-foreground font-normal">/100</span>
        </span>
      </div>
      <div className={`relative h-2.5 rounded-full ${trackColor} overflow-hidden`}>
        <div
          className={`absolute left-0 top-0 h-full rounded-full ${barColor} transition-all duration-700`}
          style={{ width: `${value}%` }}
        />
        {/* threshold marker at 55 */}
        <div className="absolute top-0 bottom-0 w-px bg-white/20" style={{ left: "55%" }} />
      </div>
    </div>
  );
}

/* ── Signal pill ───────────────────────────────────────────── */
function Pill({ label, value, sub, color }: { label: string; value: string; sub?: string; color?: string }) {
  return (
    <div className="flex flex-col items-center px-2.5 py-2 rounded-lg bg-black/20 border border-white/6 min-w-[64px]">
      <span className="text-[9px] text-muted-foreground font-mono uppercase tracking-wider leading-none">{label}</span>
      <span className={`text-xs font-bold font-mono mt-1 ${color ?? "text-foreground/80"}`}>{value}</span>
      {sub && <span className="text-[9px] text-muted-foreground/70 font-mono mt-0.5 leading-none">{sub}</span>}
    </div>
  );
}

/* ── Regime confidence bar ─────────────────────────────────── */
function RegimeBar({ regime, scores }: { regime: Regime; scores: Record<Regime, number> }) {
  const total = REGIME_ORDER.reduce((s, k) => s + scores[k], 0);
  const barColors: Record<Regime, string> = {
    trend: "bg-emerald-500", chop: "bg-amber-500", panic: "bg-red-500", earnings: "bg-blue-500",
  };
  return (
    <div className="space-y-1">
      <p className="text-[10px] font-mono uppercase tracking-wider text-muted-foreground">Regime Classification</p>
      <div className="flex gap-0.5 h-1.5 rounded-full overflow-hidden bg-black/30">
        {REGIME_ORDER.map((r) => {
          const pct = total > 0 ? (scores[r] / total) * 100 : 25;
          return (
            <div key={r} className={`h-full transition-all ${barColors[r]} ${r === regime ? "opacity-100" : "opacity-25"}`} style={{ width: `${pct}%` }} />
          );
        })}
      </div>
      <div className="flex gap-3 flex-wrap">
        {REGIME_ORDER.map((r) => {
          const pct = total > 0 ? Math.round((scores[r] / total) * 100) : 25;
          return (
            <span key={r} className={`text-[10px] font-mono ${r === regime ? "text-foreground font-bold" : "text-muted-foreground/40"}`}>
              {REGIME_LABELS[r]} {pct}%
            </span>
          );
        })}
      </div>
    </div>
  );
}

/* ── Main component ────────────────────────────────────────── */
export function MarketRegimeBanner() {
  const { data, isLoading } = useMarketRegime();

  if (isLoading) {
    return (
      <div className="rounded-xl border border-border p-5 space-y-4">
        <div className="flex gap-4">
          <Skeleton className="h-11 w-11 rounded-xl shrink-0" />
          <div className="flex-1 space-y-2">
            <Skeleton className="h-5 w-52" />
            <Skeleton className="h-3 w-72" />
          </div>
          <Skeleton className="h-28 w-28 rounded-lg shrink-0" />
        </div>
        <div className="space-y-3">
          <Skeleton className="h-8 w-full" />
          <Skeleton className="h-8 w-full" />
        </div>
        <div className="flex gap-2">
          {[...Array(5)].map((_, i) => <Skeleton key={i} className="h-12 w-16 rounded-lg" />)}
        </div>
      </div>
    );
  }

  if (!data) return null;

  const rcfg = REGIME_CFG[data.regime];
  const qcfg = QUAD_CFG[data.quadrant];
  const Icon = rcfg.icon;
  const s = data.signals;
  const spyUp = s.spyMove >= 0;
  const vixUp = s.vixChange >= 0;

  return (
    <div className={`rounded-xl border ${rcfg.border} bg-gradient-to-br ${rcfg.gradient} overflow-hidden`}>
      <div className="p-5 space-y-5">

        {/* ── Row 1: Header + Quadrant Map ─────────────────── */}
        <div className="flex items-start gap-4 flex-wrap">
          <div className={`flex items-center justify-center h-11 w-11 rounded-xl shrink-0 ${rcfg.iconBg}`}>
            <Icon className="h-5 w-5" />
          </div>

          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2.5 flex-wrap mb-1">
              <h2 className="text-base font-bold font-mono">Market Regime</h2>
              <span className={`px-2.5 py-0.5 rounded-full text-xs font-bold font-mono uppercase tracking-wider border ${rcfg.iconBg} border-current/20`}>
                {data.label}
              </span>
            </div>
            <p className="text-sm text-muted-foreground leading-relaxed max-w-xl">{data.description}</p>
          </div>

          {/* 2D map — right side */}
          <QuadrantMap opp={data.opportunityScore} risk={data.riskScore} quadrant={data.quadrant} />
        </div>

        {/* ── Row 2: 2-Axis Score Bars ─────────────────────── */}
        <div className="rounded-xl bg-black/20 border border-white/6 p-4 space-y-4">
          <div className="flex items-center gap-2 mb-0.5">
            <Crosshair className="h-3.5 w-3.5 text-muted-foreground" />
            <span className="text-[10px] font-mono uppercase tracking-wider text-muted-foreground">
              Opportunity vs Risk — {qcfg.oppLabel}, {qcfg.riskLabel}
            </span>
            <span className={`ml-auto px-2 py-0.5 rounded-full text-[10px] font-bold font-mono uppercase tracking-wider border ${qcfg.badge}`}>
              {data.quadrantLabel}
            </span>
          </div>

          <ScoreBar
            label="Opportunity"
            value={data.opportunityScore}
            barColor="bg-emerald-500"
            trackColor="bg-emerald-950/60"
            sublabel={data.opportunityScore >= 65 ? "strong setup" : data.opportunityScore >= 45 ? "moderate setup" : "weak setup"}
          />
          <ScoreBar
            label="Risk"
            value={data.riskScore}
            barColor="bg-red-500"
            trackColor="bg-red-950/60"
            sublabel={data.riskScore >= 65 ? "dangerous conditions" : data.riskScore >= 45 ? "elevated risk" : "controlled environment"}
          />
        </div>

        {/* ── Row 3: Signal Pills ───────────────────────────── */}
        <div className="flex gap-2 flex-wrap">
          <Pill label="VIX"       value={s.vix.toFixed(1)}
            sub={`${vixUp ? "+" : ""}${s.vixChange.toFixed(1)}%`}
            color={!vixUp ? "text-emerald-400" : s.vixChange > 5 ? "text-red-400" : "text-amber-400"} />
          <Pill label="SPY"       value={`${spyUp ? "+" : ""}${s.spyMove.toFixed(2)}%`}
            sub={s.spyDirection}
            color={spyUp ? "text-emerald-400" : "text-red-400"} />
          <Pill label="Direction" value={`${Math.round(s.directionalRatio * 100)}%`}
            sub="body ratio"
            color={s.directionalRatio > 0.55 ? "text-emerald-400" : s.directionalRatio < 0.3 ? "text-amber-400" : "text-foreground/70"} />
          <Pill label="Volume"    value={`${s.volumeRatio.toFixed(2)}x`}
            sub="vs avg"
            color={s.volumeRatio > 1.3 ? "text-amber-400" : "text-foreground/70"} />
          <Pill label="Dispersion" value={`${s.sectorDispersion.toFixed(2)}σ`}
            sub="sectors"
            color={s.sectorDispersion > 1.2 ? "text-blue-400" : "text-foreground/70"} />
          <div className="flex flex-col items-center px-2.5 py-2 rounded-lg bg-black/20 border border-white/6 min-w-[88px]">
            <span className="text-[9px] text-muted-foreground font-mono uppercase tracking-wider leading-none">Sectors</span>
            <span className="text-[10px] font-bold font-mono mt-1 text-emerald-400 flex items-center gap-0.5">
              <ArrowUp className="h-2.5 w-2.5" />{s.sectorBest} {s.sectorMax >= 0 ? "+" : ""}{s.sectorMax.toFixed(2)}%
            </span>
            <span className="text-[10px] font-bold font-mono text-red-400 flex items-center gap-0.5">
              <ArrowDown className="h-2.5 w-2.5" />{s.sectorWorst} {s.sectorMin.toFixed(2)}%
            </span>
          </div>
        </div>

        {/* ── Row 4: Regime bar + Hints ─────────────────────── */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <RegimeBar regime={data.regime} scores={data.scores} />

          <div className="space-y-2">
            <div className="flex items-center gap-1.5">
              <Activity className="h-3 w-3 text-muted-foreground" />
              <p className="text-[10px] font-mono uppercase tracking-wider text-muted-foreground">Regime Adjustments</p>
            </div>
            <div className="space-y-1.5">
              {data.hints.slice(0, 3).map((hint, i) => (
                <div key={i} className="flex items-start gap-2 rounded-lg bg-black/20 border border-white/5 px-2.5 py-1.5">
                  <Lightbulb className="h-3 w-3 text-muted-foreground shrink-0 mt-0.5" />
                  <p className="text-xs text-foreground/75 leading-snug">{hint}</p>
                </div>
              ))}
            </div>
          </div>
        </div>

      </div>
    </div>
  );
}
