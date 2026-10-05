import { useEffect, useRef, useState, useCallback } from "react";
import { Layout } from "@/components/layout";
import {
  ComposedChart, Area, Line, Bar, XAxis, YAxis, ResponsiveContainer,
  ReferenceLine, Tooltip, CartesianGrid,
} from "recharts";

/* ── Random walk engine ─────────────────────────────────────── */
const WINDOW = 120;

function randWalk(last: number, momentum: number): [number, number] {
  const shock = (Math.random() - 0.48) * 160;
  const newMom = momentum * 0.88 + shock * 0.18;
  return [last + newMom + (Math.random() - 0.5) * 38, newMom];
}

function makeSeed(): DataPoint[] {
  const pts: DataPoint[] = [];
  let price = 10000 + Math.random() * 4000;
  let mom = 0;
  for (let i = 0; i < WINDOW; i++) {
    const [p, m] = randWalk(price, mom);
    price = Math.max(5000, p); mom = m;
    const spread = 40 + Math.random() * 180;
    const open   = price;
    const close  = price + (Math.random() - 0.5) * spread;
    const high   = Math.max(open, close) + Math.random() * 90;
    const low    = Math.min(open, close) - Math.random() * 90;
    pts.push({ t: i, price, open, close, high, low, vol: Math.floor(3000 + Math.random() * 12000) });
  }
  return pts;
}

interface DataPoint {
  t: number; price: number;
  open: number; close: number; high: number; low: number;
  vol: number;
}

/* ── Derived indicators ─────────────────────────────────────── */
function computeIndicators(pts: DataPoint[]) {
  return pts.map((p, i) => {
    const slice5  = pts.slice(Math.max(0, i - 4),  i + 1).map(x => x.price);
    const slice10 = pts.slice(Math.max(0, i - 9),  i + 1).map(x => x.price);
    const slice20 = pts.slice(Math.max(0, i - 19), i + 1).map(x => x.price);
    const slice50 = pts.slice(Math.max(0, i - 49), i + 1).map(x => x.price);
    const avg = (arr: number[]) => arr.reduce((a, b) => a + b, 0) / arr.length;
    const ma5  = avg(slice5);
    const ma10 = avg(slice10);
    const ma20 = avg(slice20);
    const ma50 = avg(slice50);
    const std20 = i >= 19
      ? Math.sqrt(slice20.reduce((a, b) => a + (b - ma20) ** 2, 0) / slice20.length)
      : 1;
    const bbUp  = ma20 + 2 * std20;
    const bbLo  = ma20 - 2 * std20;

    /* RSI */
    const gains: number[] = []; const losses: number[] = [];
    for (let j = Math.max(1, i - 13); j <= i; j++) {
      const d = pts[j].price - pts[j - 1].price;
      if (d >= 0) gains.push(d); else losses.push(Math.abs(d));
    }
    const ag = gains.length  ? gains.reduce((a, b) => a + b, 0)  / 14 : 0;
    const al = losses.length ? losses.reduce((a, b) => a + b, 0) / 14 : 0.01;
    const rsi = 100 - 100 / (1 + ag / al);

    /* MACD */
    const macd = ma10 - ma20;
    const signal = macd * 0.85 + (i > 0 ? (pts[i - 1].price - ma20) * 0.15 : 0) * 0.15;

    return { ...p, ma5, ma10, ma20, ma50, bbUp, bbLo, rsi, macd, signal };
  });
}

/* ── Fake ticker stats ──────────────────────────────────────── */
function useFakeStats(price: number) {
  const spread = 0.5 + Math.random() * 3;
  return {
    bid:    (price - spread / 2).toFixed(2),
    ask:    (price + spread / 2).toFixed(2),
    last:   price.toFixed(2),
    change: ((Math.random() - 0.45) * 4).toFixed(2),
    vol:    (Math.floor(Math.random() * 900000 + 200000)).toLocaleString(),
    high:   (price + Math.random() * 200).toFixed(2),
    low:    (price - Math.random() * 200).toFixed(2),
    open:   (price + (Math.random() - 0.5) * 140).toFixed(2),
  };
}

/* ── SVG Candlestick chart ──────────────────────────────────── */
function CandleChart({ data, minP, maxP }: { data: any[]; minP: number; maxP: number }) {
  const VW = 1200; const VH = 320;
  const PL = 58; const PR = 8; const PT = 8; const PB = 4;
  const CW = VW - PL - PR; const CH = VH - PT - PB;

  /* Newest candle anchored at 72% — right 28% stays empty (TradingView style) */
  const ANCHOR = 0.72;
  const usedW  = CW * ANCHOR;

  const toY = (p: number) => PT + CH - ((p - minP) / (maxP - minP || 1)) * CH;
  const toX = (i: number) => PL + (i / Math.max(data.length - 1, 1)) * usedW;
  const candleW = Math.max(3, usedW / data.length * 0.78);

  /* Current-price horizontal line at newest candle */
  const newestX = PL + usedW;
  const newestY = toY(data[data.length - 1]?.price ?? 0);

  const linePath = (key: string) =>
    data.map((d, i) => `${i === 0 ? "M" : "L"}${toX(i).toFixed(1)},${toY(d[key]).toFixed(1)}`).join(" ");

  const bbFill = [
    ...data.map((d, i) => `${i === 0 ? "M" : "L"}${toX(i).toFixed(1)},${toY(d.bbUp).toFixed(1)}`),
    ...data.slice().reverse().map((d, i) => `L${toX(data.length - 1 - i).toFixed(1)},${toY(d.bbLo).toFixed(1)}`),
    "Z",
  ].join(" ");

  const gridPrices = Array.from({ length: 6 }, (_, i) => minP + ((maxP - minP) * i) / 5);

  return (
    <svg viewBox={`0 0 ${VW} ${VH}`} className="w-full" style={{ height: VH, display: "block" }}>
      {/* Grid lines */}
      {gridPrices.map((p, i) => (
        <g key={i}>
          <line x1={PL} y1={toY(p)} x2={VW - PR} y2={toY(p)} stroke="rgba(255,255,255,0.03)" strokeWidth={1} strokeDasharray="4 8" />
          <text x={PL - 4} y={toY(p) + 3} textAnchor="end" fontSize={9} fill="#444" fontFamily="monospace">
            {p >= 1000 ? `${(p / 1000).toFixed(1)}k` : p.toFixed(0)}
          </text>
        </g>
      ))}

      {/* Bollinger band fill */}
      <path d={bbFill} fill="rgba(173,198,255,0.03)" />
      <path d={linePath("bbUp")} fill="none" stroke="#adc6ff" strokeWidth={1} strokeDasharray="3 4" opacity={0.45} />
      <path d={linePath("bbLo")} fill="none" stroke="#adc6ff" strokeWidth={1} strokeDasharray="3 4" opacity={0.45} />

      {/* Moving averages */}
      <path d={linePath("ma50")} fill="none" stroke="#f43f5e" strokeWidth={1.5} opacity={0.8} />
      <path d={linePath("ma20")} fill="none" stroke="#10b981" strokeWidth={1.5} opacity={0.8} />
      <path d={linePath("ma10")} fill="none" stroke="#818cf8" strokeWidth={1}   opacity={0.75} />
      <path d={linePath("ma5")}  fill="none" stroke="#f59e0b" strokeWidth={1}   opacity={0.75} />

      {/* Right-side empty space overlay — subtle darker tint */}
      <rect x={newestX} y={PT} width={VW - PR - newestX} height={CH} fill="rgba(0,0,0,0.18)" />

      {/* Vertical separator at newest candle */}
      <line x1={newestX} y1={PT} x2={newestX} y2={PT + CH} stroke="rgba(255,255,255,0.06)" strokeWidth={1} strokeDasharray="3 4" />

      {/* Current-price dashed line extending to right edge */}
      <line x1={newestX} y1={newestY} x2={VW - PR} y2={newestY} stroke="rgba(173,198,255,0.35)" strokeWidth={1} strokeDasharray="4 5" />

      {/* Candles */}
      {data.map((d, i) => {
        const cx   = toX(i);
        const yHi  = toY(d.high);
        const yLo  = toY(d.low);
        const yO   = toY(d.open);
        const yC   = toY(d.close);
        const up   = d.close >= d.open;
        const col  = up ? "#4edea3" : "#ff5451";
        const bTop = Math.min(yO, yC);
        const bH   = Math.max(1.5, Math.abs(yC - yO));
        const hw   = candleW / 2;
        return (
          <g key={i}>
            {/* Wick */}
            <line x1={cx} y1={yHi} x2={cx} y2={yLo} stroke={col} strokeWidth={1} opacity={0.7} />
            {/* Body */}
            <rect
              x={cx - hw} y={bTop} width={candleW} height={bH}
              fill={col}
              fillOpacity={up ? 0.85 : 0.75}
              stroke={col}
              strokeWidth={0.5}
            />
          </g>
        );
      })}

      {/* Price tag at right edge */}
      {(() => {
        const last = data[data.length - 1];
        if (!last) return null;
        const up = last.close >= last.open;
        const tagCol = up ? "#4edea3" : "#ff5451";
        const tagY = Math.max(PT + 8, Math.min(PT + CH - 8, newestY));
        return (
          <g>
            <rect x={VW - PR - 54} y={tagY - 8} width={54} height={16} rx={3} fill={tagCol} fillOpacity={0.18} stroke={tagCol} strokeWidth={0.8} strokeOpacity={0.6} />
            <text x={VW - PR - 27} y={tagY + 4} textAnchor="middle" fontSize={9} fill={tagCol} fontFamily="monospace" fontWeight="bold">
              {last.price >= 1000 ? last.price.toFixed(0) : last.price.toFixed(2)}
            </text>
          </g>
        );
      })()}
    </svg>
  );
}

/* ── Colour helpers ─────────────────────────────────────────── */
const COLORS = {
  ma5:  "#f59e0b",
  ma10: "#818cf8",
  ma20: "#10b981",
  ma50: "#f43f5e",
  bb:   "#adc6ff",
  up:   "#4edea3",
  dn:   "#ff5451",
  vol:  "#3b4a6b",
  rsi:  "#a78bfa",
  macd: "#38bdf8",
  sig:  "#fb923c",
};

const FAKE_SYMBOLS = ["NVDA", "TSLA", "AAPL", "SPY", "AMZN", "META", "GOOG", "MSFT"];
const FAKE_TFS     = ["1m", "3m", "5m", "15m", "1h"];

/* ── Larp page ──────────────────────────────────────────────── */
export function LarpPage() {
  const [data, setData]   = useState(() => computeIndicators(makeSeed()));
  const [stats, setStats] = useState(() => useFakeStats(12000));
  const [symbol, setSymbol] = useState("NVDA");
  const [tf, setTf]         = useState("5m");
  const [alerts, setAlerts] = useState<string[]>([]);
  const momRef    = useRef(0);
  const tickRef   = useRef(0);
  const domainRef = useRef<[number, number] | null>(null);

  const ALERT_MSGS = [
    "⚡ Breakout detected on 5m", "🔺 Volume surge +340%", "🎯 Target hit: +2.1%",
    "📡 Smart money flow detected", "🔥 IV spike incoming", "💀 Stop hunted",
    "🌊 Momentum wave forming", "🚨 VWAP reclaim confirmed",
  ];

  const tick = useCallback(() => {
    setData(prev => {
      const last = prev[prev.length - 1];
      const [newPrice, newMom] = randWalk(last.price, momRef.current);
      momRef.current = newMom;

      const clampedPrice = Math.max(5000, newPrice);
      const wickExtra = 30 + Math.random() * 90;
      const spread    = 25 + Math.random() * 100;
      const close     = clampedPrice + (Math.random() - 0.5) * spread;
      const newPt: DataPoint = {
        t:     last.t + 1,
        price: clampedPrice,
        open:  last.close,
        close,
        high:  Math.max(last.close, close) + Math.random() * wickExtra,
        low:   Math.min(last.close, close) - Math.random() * wickExtra,
        vol:   Math.floor(2000 + Math.random() * 18000),
      };
      return computeIndicators([...prev.slice(1), newPt]);
    });

    setStats(prev => {
      const prevPrice = parseFloat(prev.last);
      const [newPrice] = randWalk(prevPrice, momRef.current * 0.5);
      return useFakeStats(Math.max(5000, newPrice));
    });

    tickRef.current++;
    if (tickRef.current % 18 === 0) {
      const msg = ALERT_MSGS[Math.floor(Math.random() * ALERT_MSGS.length)];
      setAlerts(a => [msg, ...a].slice(0, 6));
    }
  }, []);

  useEffect(() => {
    const id = setInterval(tick, 140);
    return () => clearInterval(id);
  }, [tick]);

  const last    = data[data.length - 1];
  const chgNum  = parseFloat(stats.change);
  const isUp    = chgNum >= 0;
  const prices  = data.map(d => d.price);
  const rawMin  = Math.min(...prices);
  const rawMax  = Math.max(...prices);
  const pad     = Math.max((rawMax - rawMin) * 0.12, 80);
  if (!domainRef.current) {
    domainRef.current = [rawMin - pad, rawMax + pad];
  } else {
    const α = 0.06;
    domainRef.current = [
      domainRef.current[0] * (1 - α) + (rawMin - pad) * α,
      domainRef.current[1] * (1 - α) + (rawMax + pad) * α,
    ];
  }
  const [minP, maxP] = domainRef.current;

  /* RSI domain */
  const rsiMin = 0; const rsiMax = 100;

  return (
    <Layout>
      <div className="flex flex-col gap-3 select-none">

        {/* ── Header ───────────────────────────────────────────── */}
        <div className="flex items-center justify-between flex-wrap gap-3">
          <div className="flex items-center gap-3">
            {/* Symbol pills */}
            <div className="flex gap-1">
              {FAKE_SYMBOLS.map(s => (
                <button key={s} onClick={() => setSymbol(s)}
                  className={`px-2 py-1 rounded text-[11px] font-mono font-bold transition-all ${
                    symbol === s
                      ? "bg-primary/20 border border-primary/60 text-primary"
                      : "border border-border/30 text-muted-foreground hover:text-foreground"
                  }`}>
                  {s}
                </button>
              ))}
            </div>
            {/* TF pills */}
            <div className="flex gap-1 border-l border-border/30 pl-3">
              {FAKE_TFS.map(t => (
                <button key={t} onClick={() => setTf(t)}
                  className={`px-2 py-0.5 rounded text-[10px] font-mono transition-all ${
                    tf === t
                      ? "bg-amber-500/20 border border-amber-500/40 text-amber-400"
                      : "border border-border/20 text-muted-foreground hover:text-foreground"
                  }`}>
                  {t}
                </button>
              ))}
            </div>
          </div>

          {/* Live price display */}
          <div className="flex items-center gap-4">
            <div className="text-right">
              <div
                className={`font-mono font-black tabular-nums text-2xl ${isUp ? "text-emerald-400" : "text-red-400"}`}
                style={{ textShadow: isUp ? "0 0 12px rgba(78,222,163,0.5)" : "0 0 12px rgba(255,84,81,0.5)" }}
              >
                ${stats.last}
              </div>
              <div className={`text-xs font-mono font-bold ${isUp ? "text-emerald-400" : "text-red-400"}`}>
                {isUp ? "▲" : "▼"} {Math.abs(chgNum).toFixed(2)}%
              </div>
            </div>
            <div
              className="rounded-full"
              style={{
                width: 8, height: 8,
                background: "#4edea3",
                animation: "ping 1s cubic-bezier(0,0,0.2,1) infinite",
              }}
            />
          </div>
        </div>

        {/* ── Ticker stats bar ─────────────────────────────────── */}
        <div className="flex gap-4 text-[10px] font-mono border border-border/20 rounded-lg px-4 py-2 bg-card/50 flex-wrap">
          {[
            ["BID", stats.bid, "text-emerald-400"],
            ["ASK", stats.ask, "text-red-400"],
            ["OPEN", stats.open, "text-foreground"],
            ["HIGH", stats.high, "text-emerald-400"],
            ["LOW", stats.low, "text-red-400"],
            ["VOL", stats.vol, "text-blue-400"],
          ].map(([label, val, cls]) => (
            <div key={label as string} className="flex items-center gap-1.5">
              <span className="text-muted-foreground/60 uppercase tracking-widest">{label}</span>
              <span className={`font-bold tabular-nums ${cls}`}>{val}</span>
            </div>
          ))}
          <div className="ml-auto flex items-center gap-2">
            <span className="text-muted-foreground/40 uppercase tracking-widest">indicators</span>
            {["MA5","MA10","MA20","MA50","BB","RSI","MACD","VOL"].map(ind => (
              <span key={ind} className="text-[9px] px-1.5 py-0.5 rounded border border-border/30 text-muted-foreground/60">{ind}</span>
            ))}
          </div>
        </div>

        <div className="flex gap-3">

          {/* ── Main chart area ───────────────────────────────── */}
          <div className="flex-1 flex flex-col gap-2 min-w-0">

            {/* Main price chart */}
            <div
              className="rounded-xl overflow-hidden transition-all duration-100"
              style={{
                background: "#0d0d11",
                border: "1px solid rgba(255,255,255,0.07)",
              }}
            >
              <div className="px-3 py-2 border-b border-border/20 flex items-center gap-2">
                <span className="text-[10px] font-mono text-muted-foreground/60">{symbol} · {tf} · CANDLES</span>
                <div className="flex gap-2 ml-auto text-[9px] font-mono">
                  {[["MA5","text-amber-400"],["MA10","text-indigo-400"],["MA20","text-emerald-400"],["MA50","text-rose-400"],["BB","text-blue-300"]].map(([l,c])=>(
                    <span key={l} className={c}>{l}</span>
                  ))}
                </div>
              </div>
              <CandleChart data={data} minP={minP} maxP={maxP} />
            </div>

            {/* Volume panel */}
            <div className="rounded-xl border border-border/40 overflow-hidden" style={{ background: "#0d0d11" }}>
              <div className="px-3 py-1.5 border-b border-border/20">
                <span className="text-[10px] font-mono text-muted-foreground/50">VOLUME</span>
              </div>
              <ResponsiveContainer width="100%" height={70}>
                <ComposedChart data={data} margin={{ top: 4, right: 8, bottom: 0, left: 0 }}>
                  <XAxis dataKey="t" hide />
                  <YAxis hide />
                  <Bar dataKey="vol" isAnimationActive={false}
                    fill="transparent"
                    shape={(props: any) => {
                      const { x, y, width, height, index } = props;
                      const d = data[index];
                      const up = d?.close >= d?.open;
                      return <rect x={x} y={y} width={Math.max(1, width - 1)} height={height}
                        fill={up ? "rgba(78,222,163,0.5)" : "rgba(255,84,81,0.5)"} rx={1} />;
                    }}
                  />
                </ComposedChart>
              </ResponsiveContainer>
            </div>

            {/* RSI panel */}
            <div className="rounded-xl border border-border/40 overflow-hidden" style={{ background: "#0d0d11" }}>
              <div className="px-3 py-1.5 border-b border-border/20 flex items-center justify-between">
                <span className="text-[10px] font-mono text-muted-foreground/50">RSI (14)</span>
                <span className={`text-[10px] font-mono font-bold tabular-nums ${
                  last?.rsi > 70 ? "text-red-400" : last?.rsi < 30 ? "text-emerald-400" : "text-purple-400"
                }`}>{last?.rsi.toFixed(1)}</span>
              </div>
              <ResponsiveContainer width="100%" height={80}>
                <ComposedChart data={data} margin={{ top: 4, right: 8, bottom: 0, left: 0 }}>
                  <XAxis dataKey="t" hide />
                  <YAxis domain={[rsiMin, rsiMax]} hide />
                  <ReferenceLine y={70} stroke="rgba(255,84,81,0.3)"   strokeDasharray="3 3" />
                  <ReferenceLine y={50} stroke="rgba(255,255,255,0.05)" strokeDasharray="2 4" />
                  <ReferenceLine y={30} stroke="rgba(78,222,163,0.3)"  strokeDasharray="3 3" />
                  <Area dataKey="rsi" stroke={COLORS.rsi} strokeWidth={1.5} fill="rgba(167,139,250,0.08)" dot={false} isAnimationActive={false} />
                </ComposedChart>
              </ResponsiveContainer>
            </div>

            {/* MACD panel */}
            <div className="rounded-xl border border-border/40 overflow-hidden" style={{ background: "#0d0d11" }}>
              <div className="px-3 py-1.5 border-b border-border/20 flex items-center justify-between">
                <span className="text-[10px] font-mono text-muted-foreground/50">MACD (10, 20, 9)</span>
                <div className="flex gap-3 text-[9px] font-mono">
                  <span className="text-sky-400">MACD {last?.macd.toFixed(3)}</span>
                  <span className="text-orange-400">SIG {last?.signal.toFixed(3)}</span>
                </div>
              </div>
              <ResponsiveContainer width="100%" height={80}>
                <ComposedChart data={data} margin={{ top: 4, right: 8, bottom: 0, left: 0 }}>
                  <XAxis dataKey="t" hide />
                  <YAxis hide />
                  <ReferenceLine y={0} stroke="rgba(255,255,255,0.08)" />
                  <Bar dataKey="macd" isAnimationActive={false} fill="transparent"
                    shape={(props: any) => {
                      const { x, y, width, height, value } = props;
                      const up = value >= 0;
                      return <rect x={x} y={y} width={Math.max(1, width - 1)} height={Math.abs(height)}
                        fill={up ? "rgba(56,189,248,0.5)" : "rgba(251,146,60,0.5)"} rx={1} />;
                    }}
                  />
                  <Line dataKey="signal" stroke={COLORS.sig} strokeWidth={1.5} dot={false} isAnimationActive={false} />
                  <Line dataKey="macd"   stroke={COLORS.macd} strokeWidth={1}   dot={false} isAnimationActive={false} />
                </ComposedChart>
              </ResponsiveContainer>
            </div>
          </div>

          {/* ── Right panel — alerts + fake positions ─────────── */}
          <div className="w-52 shrink-0 flex flex-col gap-2">

            {/* Position box */}
            <div className="rounded-xl border border-border/40 bg-card p-3 flex flex-col gap-2" style={{ background: "#0d0d11" }}>
              <div className="text-[10px] font-mono text-muted-foreground/60 uppercase tracking-widest border-b border-border/20 pb-2">Fake Position</div>
              {[
                { label: "ENTRY",  val: `$${(parseFloat(stats.last) - Math.random() * 4 - 1).toFixed(2)}` },
                { label: "SIZE",   val: "100 shares" },
                { label: "P&L",    val: `${isUp ? "+" : "-"}$${(Math.random() * 420 + 20).toFixed(0)}`, cls: isUp ? "text-emerald-400" : "text-red-400" },
                { label: "R:R",    val: `1 : ${(1.5 + Math.random() * 2).toFixed(1)}` },
                { label: "STOP",   val: `$${(parseFloat(stats.low) - 0.5).toFixed(2)}`, cls: "text-red-400" },
                { label: "TARGET", val: `$${(parseFloat(stats.high) + 1.2).toFixed(2)}`, cls: "text-emerald-400" },
              ].map(({ label, val, cls }) => (
                <div key={label} className="flex justify-between items-center">
                  <span className="text-[10px] font-mono text-muted-foreground/50">{label}</span>
                  <span className={`text-[11px] font-mono font-bold tabular-nums ${cls ?? "text-foreground"}`}>{val}</span>
                </div>
              ))}
            </div>

            {/* Live alerts feed */}
            <div className="rounded-xl border border-border/40 flex flex-col overflow-hidden" style={{ background: "#0d0d11" }}>
              <div className="px-3 py-2 border-b border-border/20 flex items-center gap-2">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-ping" />
                <span className="text-[10px] font-mono text-muted-foreground/60 uppercase tracking-widest">Live Alerts</span>
              </div>
              <div className="flex flex-col divide-y divide-border/10">
                {alerts.length === 0 && (
                  <p className="text-[10px] font-mono text-muted-foreground/30 p-3 text-center">Scanning…</p>
                )}
                {alerts.map((a, i) => (
                  <div key={i} className={`px-3 py-2 text-[10px] font-mono transition-colors ${i === 0 ? "text-foreground" : "text-muted-foreground/50"}`}>
                    {a}
                  </div>
                ))}
              </div>
            </div>

            {/* Fake order book */}
            <div className="rounded-xl border border-border/40 flex flex-col overflow-hidden flex-1" style={{ background: "#0d0d11" }}>
              <div className="px-3 py-2 border-b border-border/20">
                <span className="text-[10px] font-mono text-muted-foreground/60 uppercase tracking-widest">Order Book</span>
              </div>
              <div className="flex-1 overflow-hidden">
                {/* Asks */}
                {[...Array(5)].map((_, i) => {
                  const price = parseFloat(stats.ask) + (4 - i) * (0.05 + Math.random() * 0.08);
                  const size  = Math.floor(100 + Math.random() * 900);
                  const pct   = size / 10;
                  return (
                    <div key={`a${i}`} className="relative flex justify-between px-3 py-1 text-[10px] font-mono">
                      <div className="absolute inset-y-0 right-0 bg-red-500/8 transition-all" style={{ width: `${pct}%` }} />
                      <span className="text-red-400 tabular-nums">{price.toFixed(2)}</span>
                      <span className="text-muted-foreground/60 tabular-nums">{size}</span>
                    </div>
                  );
                })}
                {/* Spread */}
                <div className="px-3 py-0.5 text-[9px] font-mono text-muted-foreground/30 text-center border-y border-border/10">
                  spread {(parseFloat(stats.ask) - parseFloat(stats.bid)).toFixed(3)}
                </div>
                {/* Bids */}
                {[...Array(5)].map((_, i) => {
                  const price = parseFloat(stats.bid) - i * (0.05 + Math.random() * 0.08);
                  const size  = Math.floor(100 + Math.random() * 900);
                  const pct   = size / 10;
                  return (
                    <div key={`b${i}`} className="relative flex justify-between px-3 py-1 text-[10px] font-mono">
                      <div className="absolute inset-y-0 right-0 bg-emerald-500/8 transition-all" style={{ width: `${pct}%` }} />
                      <span className="text-emerald-400 tabular-nums">{price.toFixed(2)}</span>
                      <span className="text-muted-foreground/60 tabular-nums">{size}</span>
                    </div>
                  );
                })}
              </div>
            </div>

          </div>
        </div>

      </div>
    </Layout>
  );
}
