import { useState, useRef, useEffect, useCallback } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { Layout } from "@/components/layout";
import { Card, CardContent } from "@/components/ui/card";
import {
  Sparkles, AlertTriangle, Brain, Zap, Target, ShieldAlert,
  ChevronDown, ChevronUp, TrendingUp, TrendingDown, Minus,
  Clock, CheckCircle2, XCircle, Activity, ArrowRight,
  FlaskConical, Send, Mic, User,
  BarChart2, Shield, Lightbulb, RefreshCw,
} from "lucide-react";
import owlMascot from "/owl-mascot.png";

const BASE = import.meta.env.BASE_URL.replace(/\/$/, "");
const TOPBAR_H = 64;
const TICKER_H = 32;

/* ── Types ─────────────────────────────────────────────────── */
type Recommendation = "enter_now" | "wait_confirmation" | "wait_pullback" | "avoid";
type Lifecycle = "setup_detected" | "confirmation_triggered" | "entry_zone_active" | "target_hit" | "setup_failed" | "monitoring";
type Direction  = "bullish" | "bearish" | "neutral";
type Impact     = "high" | "medium" | "low";

interface EdgeFactor { factor: string; pct: number; direction: Direction; note: string }
interface EventRisk  { event: string; impact: Impact; note: string }

interface DeepbergResult {
  question:          string;
  symbol:            string;
  decision:          string;
  recommendation:    Recommendation;
  confidence:        number;
  lifecycle:         Lifecycle;
  edgeAttribution:   EdgeFactor[];
  contradictions:    string[];
  behavioralInsight: string | null;
  traderMistake:     string | null;
  eventRisk:         EventRisk[];
  reasoning:         string;
  entryZone:         string | null;
  target:            string | null;
  stopLoss:          string | null;
  generatedAt:       string;
}

interface OpportunityCard {
  tag: string;
  tagColor: "green" | "red" | "blue";
  icon: any;
  title: string;
  body: string;
  prompt: string;
}

interface ChatMessage {
  id: string;
  role: "ai" | "user";
  text?: string;
  cards?: OpportunityCard[];
  result?: DeepbergResult;
  loading?: boolean;
  ts: Date;
}

/* ── Config ─────────────────────────────────────────────────── */
const REC_CFG: Record<Recommendation, {
  label: string; icon: any;
  border: string; bg: string; text: string; glow: string;
}> = {
  enter_now:         { label: "Enter Now",         icon: Zap,         border: "border-emerald-500/60", bg: "bg-emerald-500/15", text: "text-emerald-400", glow: "shadow-emerald-500/20" },
  wait_confirmation: { label: "Wait for Confirm",  icon: Clock,       border: "border-blue-500/60",    bg: "bg-blue-500/15",    text: "text-blue-400",    glow: "shadow-blue-500/20"   },
  wait_pullback:     { label: "Wait for Pullback", icon: TrendingDown, border: "border-amber-500/60",  bg: "bg-amber-500/15",   text: "text-amber-400",   glow: "shadow-amber-500/20"  },
  avoid:             { label: "Avoid Setup",        icon: XCircle,     border: "border-red-500/60",     bg: "bg-red-500/15",     text: "text-red-400",     glow: "shadow-red-500/20"    },
};

const LIFECYCLE_STEPS: { id: Lifecycle; label: string }[] = [
  { id: "setup_detected",        label: "Setup Detected"    },
  { id: "confirmation_triggered", label: "Confirmation"     },
  { id: "entry_zone_active",     label: "Entry Zone Active" },
  { id: "target_hit",            label: "Target Hit"        },
];
const LIFECYCLE_TERMINAL: Lifecycle[] = ["target_hit", "setup_failed"];
const LIFECYCLE_INDEX: Record<Lifecycle, number> = {
  monitoring:             -1,
  setup_detected:          0,
  confirmation_triggered:  1,
  entry_zone_active:       2,
  target_hit:              3,
  setup_failed:            3,
};

const DIR_CFG: Record<Direction, { icon: any; color: string; bar: string }> = {
  bullish: { icon: TrendingUp,   color: "text-emerald-400",      bar: "bg-emerald-500" },
  neutral: { icon: Minus,        color: "text-muted-foreground", bar: "bg-zinc-600"    },
  bearish: { icon: TrendingDown, color: "text-red-400",          bar: "bg-red-500"     },
};

const IMPACT_CFG: Record<Impact, { color: string; label: string }> = {
  high:   { color: "text-red-400 border-red-500/40 bg-red-500/10",      label: "HIGH IMPACT" },
  medium: { color: "text-amber-400 border-amber-500/40 bg-amber-500/10", label: "MED IMPACT"  },
  low:    { color: "text-blue-400 border-blue-500/40 bg-blue-500/10",    label: "LOW IMPACT"  },
};

const TAG_COLORS: Record<string, string> = {
  green: "text-emerald-400 bg-emerald-500/10 border-emerald-500/30",
  red:   "text-red-400 bg-red-500/10 border-red-500/30",
  blue:  "text-blue-400 bg-blue-500/10 border-blue-500/30",
};

const QUICK_PROMPTS = [
  "Should I buy NVDA right now?",
  "Is SPY bullish or bearish?",
  "What's the setup on TSLA?",
  "Is AMD a good entry today?",
  "Is the market safe to trade?",
  "AAPL — enter now or wait?",
  "Best options play this week?",
  "Is META overbought?",
];

/* ── Sub-components ─────────────────────────────────────────── */
function ConfidenceMeter({ value }: { value: number }) {
  const color = value >= 70 ? "bg-emerald-500" : value >= 50 ? "bg-amber-500" : "bg-red-500";
  const label = value >= 75 ? "Very confident" : value >= 55 ? "Fairly confident" : "Not very confident";
  return (
    <div className="space-y-1.5">
      <div className="flex items-center justify-between text-xs font-mono">
        <span className="text-muted-foreground uppercase tracking-wider">Confidence</span>
        <span className={`font-bold ${value >= 70 ? "text-emerald-400" : value >= 50 ? "text-amber-400" : "text-red-400"}`}>
          {value}% — {label}
        </span>
      </div>
      <div className="relative h-2 rounded-full bg-muted overflow-hidden">
        <div className={`absolute left-0 top-0 h-full rounded-full ${color} transition-all duration-1000`} style={{ width: `${value}%` }} />
        {[25, 50, 75].map(n => (
          <div key={n} className="absolute top-0 bottom-0 w-px bg-background/40" style={{ left: `${n}%` }} />
        ))}
      </div>
    </div>
  );
}

function LifecycleTracker({ stage }: { stage: Lifecycle }) {
  const idx    = LIFECYCLE_INDEX[stage];
  const done   = LIFECYCLE_TERMINAL.includes(stage);
  const failed = stage === "setup_failed";
  if (stage === "monitoring") return null;
  return (
    <div className="flex items-center gap-0">
      {LIFECYCLE_STEPS.map((step, i) => {
        const active = i === idx;
        const past   = i < idx;
        const isFail = done && failed && i === 3;
        const isHit  = done && !failed && i === 3;
        return (
          <div key={step.id} className="flex items-center flex-1 min-w-0">
            <div className="flex flex-col items-center gap-1 flex-1 min-w-0">
              <div className={`w-5 h-5 rounded-full flex items-center justify-center border-2 text-[9px] font-bold
                ${isFail  ? "border-red-500 bg-red-500/20 text-red-400"
                  : isHit   ? "border-emerald-500 bg-emerald-500/20 text-emerald-400"
                  : active  ? "border-primary bg-primary/20 text-primary animate-pulse"
                  : past    ? "border-emerald-500/60 bg-emerald-500/15 text-emerald-400"
                  :           "border-border bg-muted/20 text-muted-foreground/30"}`}>
                {isFail ? "✗" : (past || isHit) ? "✓" : i + 1}
              </div>
              <span className={`text-[8px] font-mono text-center truncate w-full px-0.5
                ${active ? "text-primary font-bold" : past ? "text-emerald-400/70" : "text-muted-foreground/30"}`}>
                {isFail ? "Failed" : step.label}
              </span>
            </div>
            {i < 3 && <div className={`h-0.5 flex-1 mx-1 -mt-4 rounded-full ${past || (done && i < 3) ? "bg-emerald-500/60" : "bg-border/40"}`} />}
          </div>
        );
      })}
    </div>
  );
}

function EdgeBar({ factor }: { factor: EdgeFactor }) {
  const cfg = DIR_CFG[factor.direction];
  const Icon = cfg.icon;
  return (
    <div className="space-y-1">
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-1.5 min-w-0">
          <Icon className={`h-3 w-3 shrink-0 ${cfg.color}`} />
          <span className="text-xs font-mono font-semibold text-foreground/80 truncate">{factor.factor}</span>
        </div>
        <span className="text-xs font-bold font-mono w-8 text-right shrink-0">{factor.pct}%</span>
      </div>
      <div className="relative h-1.5 rounded-full bg-muted overflow-hidden">
        <div className={`absolute left-0 top-0 h-full rounded-full ${cfg.bar} opacity-80 transition-all duration-700`} style={{ width: `${factor.pct}%` }} />
      </div>
    </div>
  );
}

function ReasoningBlock({ text }: { text: string }) {
  const [open, setOpen] = useState(false);
  const paragraphs = text.split(/\n+/).filter(Boolean);
  const preview = paragraphs[0] ?? text;
  return (
    <div className="rounded-xl border border-border/50 bg-black/20 overflow-hidden">
      <button onClick={() => setOpen(v => !v)} className="w-full flex items-center justify-between px-4 py-3 hover:bg-accent/10 transition-colors">
        <div className="flex items-center gap-2">
          <FlaskConical className="h-3.5 w-3.5 text-muted-foreground" />
          <span className="text-xs font-bold uppercase tracking-wider text-muted-foreground font-mono">Full reasoning</span>
        </div>
        {open ? <ChevronUp className="h-4 w-4 text-muted-foreground" /> : <ChevronDown className="h-4 w-4 text-muted-foreground" />}
      </button>
      {open
        ? <div className="px-4 pb-4 space-y-2">{paragraphs.map((p, i) => <p key={i} className="text-sm text-foreground/80 leading-relaxed">{p}</p>)}</div>
        : <p className="px-4 pb-3 text-xs text-muted-foreground/60 leading-relaxed italic">{preview.slice(0, 120)}{preview.length > 120 ? "…" : ""}</p>
      }
    </div>
  );
}

/* ── Result Card (compact for chat) ─────────────────────────── */
function ResultCard({ data }: { data: DeepbergResult }) {
  const rcfg = REC_CFG[data.recommendation] ?? REC_CFG.wait_confirmation;
  const Icon = rcfg.icon;
  return (
    <div className="space-y-3 max-w-xl">
      <div className={`rounded-xl border-2 ${rcfg.border} ${rcfg.bg} p-4 space-y-3`}>
        <div className="flex items-center gap-3">
          <div className={`flex items-center justify-center h-10 w-10 rounded-xl border-2 ${rcfg.border} ${rcfg.bg} shrink-0`}>
            <Icon className={`h-5 w-5 ${rcfg.text}`} />
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 mb-1 flex-wrap">
              <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold font-mono uppercase tracking-widest border ${rcfg.border} ${rcfg.text}`}>
                {rcfg.label}
              </span>
              {data.symbol !== "MARKET" && (
                <span className="px-2 py-0.5 rounded-full bg-muted border border-border text-[10px] font-mono font-bold">{data.symbol}</span>
              )}
            </div>
            <p className={`text-sm font-bold font-mono leading-snug ${rcfg.text}`}>{data.decision}</p>
          </div>
        </div>
        {(data.entryZone || data.target || data.stopLoss) && (
          <div className="grid grid-cols-3 gap-2 pt-2 border-t border-white/8">
            {[
              { label: "Entry", value: data.entryZone, color: "text-blue-400" },
              { label: "Target", value: data.target, color: "text-emerald-400" },
              { label: "Stop", value: data.stopLoss, color: "text-red-400" },
            ].map(({ label, value, color }) => value && (
              <div key={label} className="text-center space-y-0.5">
                <p className="text-[9px] text-muted-foreground font-mono uppercase">{label}</p>
                <p className={`text-xs font-bold font-mono ${color}`}>{value}</p>
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="rounded-xl border border-border/40 bg-black/10 p-3 space-y-3">
        <ConfidenceMeter value={data.confidence} />
        {data.lifecycle !== "monitoring" && (
          <div className="pt-2 border-t border-border/30">
            <LifecycleTracker stage={data.lifecycle} />
          </div>
        )}
      </div>

      {data.edgeAttribution.length > 0 && (
        <div className="rounded-xl border border-border/40 bg-black/10 p-3 space-y-2">
          <div className="flex items-center gap-1.5 mb-1">
            <Target className="h-3 w-3 text-muted-foreground" />
            <span className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground font-mono">Signal attribution</span>
          </div>
          <div className="space-y-2">{data.edgeAttribution.map(f => <EdgeBar key={f.factor} factor={f} />)}</div>
        </div>
      )}

      {data.contradictions.length > 0 && (
        <div className="space-y-1.5">
          {data.contradictions.map((c, i) => (
            <div key={i} className="flex items-start gap-2.5 rounded-lg border border-red-500/30 bg-red-500/8 px-3 py-2">
              <AlertTriangle className="h-3.5 w-3.5 text-red-400 shrink-0 mt-0.5" />
              <p className="text-xs text-red-300 leading-snug">{c}</p>
            </div>
          ))}
        </div>
      )}

      {(data.behavioralInsight || data.traderMistake) && (
        <div className="rounded-lg border border-amber-500/25 bg-amber-500/5 p-3 space-y-2">
          <div className="flex items-center gap-1.5">
            <Brain className="h-3.5 w-3.5 text-amber-400" />
            <span className="text-[10px] font-bold uppercase tracking-wider text-amber-400 font-mono">Watch out</span>
          </div>
          {data.behavioralInsight && <p className="text-xs text-amber-100/80 leading-relaxed">{data.behavioralInsight}</p>}
          {data.traderMistake && (
            <div className="flex items-start gap-1.5 rounded bg-amber-500/10 border border-amber-500/20 px-2 py-1.5">
              <ArrowRight className="h-3 w-3 text-amber-400 shrink-0 mt-0.5" />
              <p className="text-[11px] text-amber-300 font-medium">{data.traderMistake}</p>
            </div>
          )}
        </div>
      )}

      {data.eventRisk.length > 0 && (
        <div className="rounded-xl border border-border/40 bg-black/10 p-3 space-y-2">
          <div className="flex items-center gap-1.5">
            <ShieldAlert className="h-3 w-3 text-muted-foreground" />
            <span className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground font-mono">Upcoming risks</span>
          </div>
          {data.eventRisk.map((e, i) => {
            const cfg = IMPACT_CFG[e.impact];
            return (
              <div key={i} className={`flex items-start gap-2 rounded-lg border px-3 py-2 ${cfg.color}`}>
                <span className={`text-[9px] font-bold font-mono px-1 py-0.5 rounded border shrink-0 mt-0.5 ${cfg.color}`}>{cfg.label}</span>
                <div><p className="text-xs font-bold font-mono">{e.event}</p><p className="text-[10px] text-muted-foreground">{e.note}</p></div>
              </div>
            );
          })}
        </div>
      )}

      {data.reasoning && <ReasoningBlock text={data.reasoning} />}
    </div>
  );
}

/* ── Opportunity Card ────────────────────────────────────────── */
function OpCard({ card, onSelect }: { card: OpportunityCard; onSelect: (q: string) => void }) {
  const Icon = card.icon;
  const tagCls = TAG_COLORS[card.tagColor] ?? TAG_COLORS.blue;
  return (
    <div
      className="glass-card-copilot p-5 rounded-xl flex flex-col justify-between hover:border-blue-400/40 transition-all duration-200 group cursor-pointer border border-white/8"
      onClick={() => onSelect(card.prompt)}
    >
      <div>
        <div className="flex items-center justify-between mb-3">
          <span className={`text-[10px] font-mono font-bold px-2 py-0.5 rounded border uppercase tracking-wider ${tagCls}`}>{card.tag}</span>
          <Icon className="h-4 w-4 text-slate-600 group-hover:text-blue-400 transition-colors" />
        </div>
        <h3 className="text-sm font-bold text-slate-200 mb-1.5 font-mono">{card.title}</h3>
        <p className="text-xs text-slate-500 leading-relaxed">{card.body}</p>
      </div>
      <div className="mt-4 flex gap-2">
        <button className="flex-1 py-1.5 bg-blue-500/20 border border-blue-500/30 text-blue-400 text-[10px] font-mono font-bold rounded hover:bg-blue-500/30 transition-all uppercase tracking-wider">
          Ask Copilot →
        </button>
      </div>
    </div>
  );
}

/* ── Vex mood config ─────────────────────────────────────────── */
type VexMood = "bullish" | "cautious" | "chop" | "neutral";

const VEX_MOOD: Record<VexMood, {
  label: string; color: string; dot: string;
  thinkingLines: string[];
}> = {
  bullish: {
    label: "FEELING BULLISH",
    color: "text-emerald-400",
    dot: "bg-emerald-400",
    thinkingLines: ["On it, this looks interesting…", "Scanning the charts…", "Running the numbers…", "Locking in the analysis…"],
  },
  cautious: {
    label: "CAUTIOUS MODE",
    color: "text-amber-400",
    dot: "bg-amber-400",
    thinkingLines: ["Careful now, let me check…", "Reading the signals…", "Cross-referencing data…", "Thinking this through…"],
  },
  chop: {
    label: "WATCHING CLOSELY",
    color: "text-blue-400",
    dot: "bg-blue-400/80",
    thinkingLines: ["Choppy out there… let me look…", "Sorting through the noise…", "Scanning for clarity…", "Crunching the data…"],
  },
  neutral: {
    label: "ANALYTICAL",
    color: "text-slate-400",
    dot: "bg-slate-400",
    thinkingLines: ["Processing your question…", "Pulling the data…", "Analyzing…", "Running the model…"],
  },
};

function getMood(regime: any): VexMood {
  const label: string = (regime?.regime ?? "").toUpperCase();
  if (label.includes("BULL") || label.includes("RISK-ON")) return "bullish";
  if (label.includes("CAUTION") || label.includes("BEAR") || label.includes("RISK-OFF")) return "cautious";
  if (label.includes("CHOP") || label.includes("MIXED") || label.includes("SIDEWAYS")) return "chop";
  return "neutral";
}

const VEX_GREETINGS: Record<VexMood, string[]> = {
  bullish: [
    "Morning, Trader. Markets are looking spicy today — I've been eyeing a few setups worth your attention. **Let's make some moves.**",
    "Hey there. The bulls are in charge right now. I've already spotted three opportunities that fit this regime. **Ready when you are.**",
    "Good to see you. Strong risk-on tone in the market — this is the kind of environment I get excited about. **Here's what I'm watching.**",
  ],
  cautious: [
    "Hey Trader. I'm going to be straight with you — the market is giving mixed signals right now. **Tread carefully, but there are still plays worth looking at.**",
    "Welcome back. Risk regime has me a little cautious today. I've identified a few defensive setups and one contrarian opportunity. **Want to walk through them?**",
    "Heads up, Trader. Volatility is elevated and I'm in protective mode. **I've flagged three situations you should know about.**",
  ],
  chop: [
    "Hey. It's a choppy one today — no clear trend, which actually means premium sellers have the edge. **I've been doing my homework. Here's what I found.**",
    "Trader, this market is rangebound and noisy. The playbook changes in chop. **Let me show you what's actually working right now.**",
    "Hoot. Sideways action today. Boring for trend traders, but not for us. **I've spotted a few setups that thrive in this regime.**",
  ],
  neutral: [
    "Hey Trader. Mixed signals across the board — I've been scanning all morning. **Here are three things on my radar today.**",
    "Welcome back. Market's undecided right now, so I'll let the data do the talking. **Three opportunities I've identified for you.**",
    "Good to see you. I've run a full regime scan and flagged the best risk/reward setups available right now. **Let's dig in.**",
  ],
};

function pickRandom<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)];
}

/* ── Thinking bubble ─────────────────────────────────────────── */
function ThinkingBubble({ mood }: { mood: VexMood }) {
  const cfg = VEX_MOOD[mood];
  const line = pickRandom(cfg.thinkingLines);
  return (
    <div className="flex items-start gap-3">
      <div className="w-14 h-14 rounded-full shrink-0 overflow-hidden"
        style={{ border: "1px solid rgba(173,198,255,0.3)", background: "rgba(19,19,21,0.7)" }}>
        <img src={owlMascot} alt="Vex" className="w-full h-full object-cover" />
      </div>
      <div className="rounded-2xl px-5 py-3 flex items-center gap-2"
        style={{ background: "rgba(19,19,21,0.7)", backdropFilter: "blur(20px)", border: "1px solid rgba(255,255,255,0.08)" }}>
        <span className="text-xs text-slate-400 font-mono italic">{line}</span>
        <span className="flex gap-1">
          {[0, 1, 2].map(i => (
            <span key={i} className={`w-1.5 h-1.5 rounded-full ${cfg.dot} animate-bounce`} style={{ animationDelay: `${i * 0.15}s` }} />
          ))}
        </span>
      </div>
    </div>
  );
}

/* ── Page ────────────────────────────────────────────────────── */
export function AskDeepberg() {
  const [input, setInput] = useState("");
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [initialized, setInitialized] = useState(false);
  const [vexMood, setVexMood] = useState<VexMood>("neutral");
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const { data: regime } = useQuery<any>({
    queryKey: ["regime"],
    queryFn: () => fetch(`${BASE}/api/market-regime`).then(r => r.json()).catch(() => null),
    staleTime: 60_000,
  });

  const { data: fearGreed } = useQuery<any>({
    queryKey: ["feargreed"],
    queryFn: () => fetch(`${BASE}/api/fear-greed`).then(r => r.json()).catch(() => null),
    staleTime: 60_000,
  });

  const { data: marketData } = useQuery<any>({
    queryKey: ["market-spy"],
    queryFn: () => fetch(`${BASE}/api/stocks/SPY`).then(r => r.json()).catch(() => null),
    staleTime: 30_000,
  });

  const buildProactiveCards = useCallback((reg: any): OpportunityCard[] => {
    const label: string = reg?.regime ?? "RISK-ON";
    const isRiskOn = label.includes("RISK-ON") || label.includes("BULL");
    const isCaution = label.includes("CAUTION") || label.includes("MIXED");

    return [
      {
        tag: isRiskOn ? "LOW RISK" : "STRATEGIC",
        tagColor: isRiskOn ? "green" : "red",
        icon: Shield,
        title: isRiskOn ? "Sector Rotation Opportunity" : "Defensive Positioning",
        body: isRiskOn
          ? "Tech and momentum are leading. Consider trimming laggards and rotating into high-momentum names."
          : "Risk regime is cautious. Reducing beta exposure and adding defensive sectors may protect capital.",
        prompt: isRiskOn ? "Which sectors are leading right now?" : "How should I position defensively?",
      },
      {
        tag: "ALPHA SIGNAL",
        tagColor: "blue",
        icon: TrendingUp,
        title: "Momentum Leaders Scan",
        body: "Several large-cap names show elevated options flow and breakout setups. Let me surface the highest-conviction plays.",
        prompt: "What are the best momentum stocks to watch today?",
      },
      {
        tag: isCaution ? "HEDGE" : "OPPORTUNITY",
        tagColor: isCaution ? "red" : "green",
        icon: Lightbulb,
        title: isCaution ? "Volatility Hedge Setup" : "Options Flow Intelligence",
        body: isCaution
          ? "Unusual put activity detected across broad market ETFs. A small hedge may reduce drawdown risk."
          : "Smart money options flow is spiking on select tickers. Ask me to identify the best setups.",
        prompt: isCaution ? "How do I hedge against a market pullback?" : "Which stocks have the best options flow right now?",
      },
    ];
  }, []);

  useEffect(() => {
    if (initialized || !regime) return;
    setInitialized(true);
    const cards = buildProactiveCards(regime);
    const mood = getMood(regime);
    setVexMood(mood);
    const greeting = pickRandom(VEX_GREETINGS[mood]);

    setMessages([{
      id: "init",
      role: "ai",
      text: greeting,
      cards,
      ts: new Date(),
    }]);
  }, [regime, initialized, buildProactiveCards]);

  const { mutate: analyze } = useMutation<DeepbergResult, Error, { id: string; question: string }>({
    mutationFn: async ({ question }) => {
      const res = await fetch(`${BASE}/api/ask-deepberg`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ question }),
      });
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        throw new Error(j.error ?? "Analysis failed");
      }
      return res.json();
    },
    onSuccess: (data, { id }) => {
      setMessages(prev => prev.map(m =>
        m.id === id ? { ...m, loading: false, result: data, text: undefined } : m
      ));
    },
    onError: (err, { id }) => {
      setMessages(prev => prev.map(m =>
        m.id === id ? { ...m, loading: false, text: `Sorry, analysis failed: ${err.message}` } : m
      ));
    },
  });

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  const handleSend = useCallback((q?: string) => {
    const question = (q ?? input).trim();
    if (!question) return;
    setInput("");

    const userId = `user-${Date.now()}`;
    const aiId   = `ai-${Date.now()}`;

    setMessages(prev => [
      ...prev,
      { id: userId, role: "user", text: question, ts: new Date() },
      { id: aiId,   role: "ai",  loading: true,   ts: new Date() },
    ]);

    setTimeout(() => analyze({ id: aiId, question }), 100);
  }, [input, analyze]);

  const handleKey = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); handleSend(); }
  };

  const fgScore = fearGreed?.score ?? fearGreed?.value ?? null;
  const fgLabel = fearGreed?.label ?? (fgScore !== null ? (fgScore >= 60 ? "Greed" : fgScore >= 40 ? "Neutral" : "Fear") : "—");
  const spyChange = marketData?.changePercent ?? null;
  const spyPositive = spyChange !== null && spyChange >= 0;

  const chatH = `calc(100vh - ${TOPBAR_H + TICKER_H}px)`;

  return (
    <Layout>
      <div className="flex overflow-hidden" style={{ height: chatH }}>

        {/* ── Chat column ─────────────────────────────────────── */}
        <div className="flex-1 flex flex-col min-w-0">

          {/* Scrollable messages */}
          <div className="flex-1 overflow-y-auto px-6 pt-6 pb-4 relative">
            {/* Ambient glow */}
            <div className="pointer-events-none absolute top-0 left-1/2 -translate-x-1/2 w-[600px] h-[300px] rounded-full"
              style={{ background: "rgba(173,198,255,0.04)", filter: "blur(80px)" }} />

            <div className="max-w-3xl mx-auto w-full space-y-8 relative z-10">
              {messages.length === 0 && (
                <div className="flex flex-col items-center justify-center py-20 space-y-4 text-center">
                  <img src={owlMascot} alt="Vex" className="w-44 h-44 object-contain opacity-70 animate-pulse" />
                  <p className="text-slate-400 text-sm font-mono">Loading market data<span className="animate-pulse">...</span></p>
                </div>
              )}

              {messages.map((msg) => (
                <div key={msg.id}>
                  {msg.role === "user" ? (
                    /* User message */
                    <div className="flex items-start gap-3 justify-end">
                      <div className="rounded-2xl px-5 py-3 max-w-md"
                        style={{ background: "rgba(77,142,255,0.15)", border: "1px solid rgba(77,142,255,0.25)" }}>
                        <p className="text-sm text-slate-200">{msg.text}</p>
                      </div>
                      <div className="w-8 h-8 rounded-lg shrink-0 flex items-center justify-center bg-white/5 border border-white/10">
                        <User className="h-4 w-4 text-slate-400" />
                      </div>
                    </div>
                  ) : (
                    /* AI message */
                    <div className="flex flex-col gap-4 items-start">
                      {/* Avatar row */}
                      <div className="flex items-center gap-3">
                        <div className="w-16 h-16 rounded-full shrink-0 overflow-hidden"
                          style={{ border: `2px solid ${vexMood === "bullish" ? "rgba(78,222,163,0.5)" : vexMood === "cautious" ? "rgba(251,191,36,0.5)" : "rgba(173,198,255,0.4)"}`, background: "rgba(19,19,21,0.7)", boxShadow: `0 0 16px ${vexMood === "bullish" ? "rgba(78,222,163,0.15)" : vexMood === "cautious" ? "rgba(251,191,36,0.15)" : "rgba(173,198,255,0.12)"}` }}>
                          <img src={owlMascot} alt="Vex" className="w-full h-full object-cover" />
                        </div>
                        <div>
                          <span className="text-xs font-bold font-mono ai-gradient-text">VEX</span>
                          <span className={`ml-2 text-[10px] font-mono ${VEX_MOOD[vexMood].color}`}>
                            {VEX_MOOD[vexMood].label}
                          </span>
                        </div>
                      </div>

                      {/* Loading */}
                      {msg.loading && <ThinkingBubble mood={vexMood} />}

                      {/* Text bubble */}
                      {!msg.loading && msg.text && (
                        <div className="rounded-2xl px-6 py-4 max-w-2xl"
                          style={{ background: "rgba(19,19,21,0.7)", backdropFilter: "blur(20px)", border: "1px solid rgba(255,255,255,0.08)" }}>
                          <p className="text-sm text-slate-200 leading-relaxed">
                            {msg.text.split(/\*\*(.+?)\*\*/).map((part, i) =>
                              i % 2 === 1
                                ? <span key={i} className="text-blue-300 font-semibold">{part}</span>
                                : <span key={i}>{part}</span>
                            )}
                          </p>
                        </div>
                      )}

                      {/* Result card */}
                      {!msg.loading && msg.result && <ResultCard data={msg.result} />}

                      {/* Opportunity cards */}
                      {msg.cards && (
                        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 w-full max-w-2xl">
                          {msg.cards.map((card, i) => (
                            <OpCard key={i} card={card} onSelect={handleSend} />
                          ))}
                        </div>
                      )}
                    </div>
                  )}
                </div>
              ))}
              <div ref={messagesEndRef} />
            </div>
          </div>

          {/* ── Pill input ─────────────────────────────────────── */}
          <div className="px-6 py-4 border-t border-white/5">
            <div className="max-w-3xl mx-auto">
              <div className="flex items-center gap-2 rounded-full p-1.5 pl-4"
                style={{ background: "rgba(19,19,21,0.7)", backdropFilter: "blur(20px)", border: "1px solid rgba(255,255,255,0.12)", boxShadow: "0 0 0 1px rgba(173,198,255,0.1)" }}>
                <input
                  ref={inputRef}
                  value={input}
                  onChange={e => setInput(e.target.value)}
                  onKeyDown={handleKey}
                  placeholder="Ask Vex anything about markets or stocks..."
                  className="flex-1 bg-transparent border-none text-sm text-slate-200 placeholder:text-slate-600 focus:outline-none font-mono"
                />
                <div className="flex items-center gap-1 shrink-0">
                  <button className="p-2 text-slate-500 hover:text-slate-300 transition-colors">
                    <Mic className="h-4 w-4" />
                  </button>
                  <button
                    onClick={() => handleSend()}
                    disabled={!input.trim()}
                    className="flex items-center gap-1.5 px-4 py-2 rounded-full text-xs font-bold font-mono disabled:opacity-30 disabled:cursor-not-allowed transition-all"
                    style={{ background: "rgba(77,142,255,1)", color: "#001a42" }}
                  >
                    <Send className="h-3.5 w-3.5" />
                    Send
                  </button>
                </div>
              </div>
              <p className="text-[10px] text-slate-600 font-mono text-center mt-2">Press Enter to send · Not financial advice</p>
            </div>
          </div>
        </div>

        {/* ── Right context panel ─────────────────────────────── */}
        <aside className="hidden xl:flex flex-col w-80 border-l border-white/5 overflow-y-auto"
          style={{ background: "rgba(14,14,16,0.4)", backdropFilter: "blur(12px)" }}>
          <div className="p-5 space-y-6">

            {/* Header */}
            <div className="flex items-center justify-between border-b border-white/5 pb-4">
              <span className="text-[10px] font-mono font-bold text-blue-400 uppercase tracking-[0.2em]">Market Context</span>
              <Activity className="h-3.5 w-3.5 text-slate-500" />
            </div>

            {/* Market Pulse */}
            <div className="space-y-3">
              <h4 className="text-xs font-bold font-mono text-slate-300">Market Pulse</h4>
              <div className="glass-card-copilot rounded-xl p-4 space-y-4">
                <div className="flex justify-between items-center">
                  <div>
                    <p className="text-[10px] text-slate-500 uppercase tracking-widest font-mono mb-0.5">Sentiment</p>
                    <p className="text-sm font-bold font-mono" style={{ color: (fgScore ?? 50) >= 60 ? "#4edea3" : (fgScore ?? 50) >= 40 ? "#adc6ff" : "#ff5451" }}>
                      {fgLabel}{fgScore !== null ? ` (${fgScore})` : ""}
                    </p>
                  </div>
                  <div className="w-10 h-10 rounded-full border-2 flex items-center justify-center"
                    style={{ borderColor: (fgScore ?? 50) >= 60 ? "rgba(78,222,163,0.4)" : "rgba(173,198,255,0.3)" }}>
                    <BarChart2 className="h-4 w-4 text-slate-400" />
                  </div>
                </div>
                <div className="space-y-2">
                  <div className="flex justify-between text-xs font-mono">
                    <span className="text-slate-400">S&P 500 (SPY)</span>
                    <span className={spyPositive ? "text-emerald-400" : "text-red-400"}>
                      {spyChange !== null ? `${spyPositive ? "+" : ""}${spyChange.toFixed(2)}%` : "—"}
                    </span>
                  </div>
                  {spyChange !== null && (
                    <div className="w-full h-1 bg-white/5 rounded-full overflow-hidden">
                      <div className={`h-full rounded-full ${spyPositive ? "bg-emerald-500" : "bg-red-500"}`}
                        style={{ width: `${Math.min(Math.abs(spyChange) * 20, 100)}%` }} />
                    </div>
                  )}
                </div>
                {regime?.regime && (
                  <div className="pt-2 border-t border-white/5">
                    <p className="text-[10px] text-slate-500 uppercase tracking-widest font-mono mb-1">Regime</p>
                    <span className="text-[10px] font-mono font-bold px-2 py-0.5 rounded border"
                      style={{ color: "#4edea3", borderColor: "rgba(78,222,163,0.3)", background: "rgba(78,222,163,0.08)" }}>
                      {regime.regime}
                    </span>
                  </div>
                )}
              </div>
            </div>

            {/* Quick Prompts */}
            <div className="space-y-3">
              <h4 className="text-xs font-bold font-mono text-slate-300">Quick Questions</h4>
              <div className="space-y-1.5">
                {QUICK_PROMPTS.map((q) => (
                  <button
                    key={q}
                    onClick={() => handleSend(q)}
                    className="w-full text-left text-[11px] text-slate-400 px-3 py-2 rounded-lg border border-white/5 hover:border-blue-400/30 hover:text-slate-200 hover:bg-blue-500/5 transition-all font-mono"
                  >
                    {q}
                  </button>
                ))}
              </div>
            </div>

            {/* Reset */}
            <button
              onClick={() => { setMessages([]); setInitialized(false); setVexMood("neutral"); }}
              className="w-full flex items-center justify-center gap-2 py-2 rounded-lg border border-white/8 text-slate-500 hover:text-slate-300 hover:border-white/15 transition-all text-xs font-mono"
            >
              <RefreshCw className="h-3.5 w-3.5" />
              New Session
            </button>
          </div>
        </aside>
      </div>
    </Layout>
  );
}
