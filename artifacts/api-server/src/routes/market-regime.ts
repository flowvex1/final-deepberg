import { Router } from "express";
import { cache } from "../lib/cache";
import { yf } from "../lib/yahoo";

const router = Router();

type Regime = "trend" | "chop" | "panic" | "earnings";

interface RegimeSignals {
  vix: number;
  vixChange: number;
  spyMove: number;
  spyDirection: "bullish" | "bearish" | "flat";
  directionalRatio: number;
  volumeRatio: number;
  sectorDispersion: number;
  sectorMax: number;
  sectorMin: number;
  sectorBest: string;
  sectorWorst: string;
}

type Quadrant = "prime" | "high-stakes" | "patient" | "danger";

interface RegimeResult {
  regime:          Regime;
  label:           string;
  confidence:      number;
  opportunityScore: number;
  riskScore:        number;
  quadrant:         Quadrant;
  quadrantLabel:    string;
  scores:          Record<Regime, number>;
  signals:         RegimeSignals;
  description:     string;
  hints:           string[];
  color:           string;
  updatedAt:       string;
}

const SECTOR_ETFS = [
  { symbol: "XLK",  name: "Tech"        },
  { symbol: "XLF",  name: "Finance"     },
  { symbol: "XLV",  name: "Health"      },
  { symbol: "XLE",  name: "Energy"      },
  { symbol: "XLY",  name: "Cons. Disc." },
  { symbol: "XLI",  name: "Industrial"  },
  { symbol: "XLC",  name: "Comm."       },
];

const REGIME_META: Record<Regime, { label: string; color: string; description: string; hints: string[] }> = {
  trend: {
    label:       "Trend Day",
    color:       "emerald",
    description: "Market showing clear directional bias with conviction. Momentum strategies are rewarded — respect the tape and trade in the direction of flow.",
    hints: [
      "Follow the prevailing direction — counter-trend fades carry high risk today",
      "Look for pullbacks to VWAP or key intraday levels as momentum entries",
      "Options: favor directional debit spreads over premium selling into strength",
      "Size up on breakout confirmations backed by above-average volume",
    ],
  },
  chop: {
    label:       "Chop / Sideways",
    color:       "amber",
    description: "Market oscillating in a range with no clear directional conviction. Premium sellers and mean-reversion traders have the edge.",
    hints: [
      "Fade the extremes of the range — whipsaw risk punishes trend-followers",
      "Options: strangles, iron condors, and calendar spreads thrive in low-movement conditions",
      "Reduce directional position size and tighten stops to avoid chop-outs",
      "Watch for a 2pm–3pm directional resolve — chop days often end with a late rush",
    ],
  },
  panic: {
    label:       "High Volatility / Panic",
    color:       "red",
    description: "Elevated fear and outsized price swings are dominating. VIX is elevated — protection and patience beat aggression.",
    hints: [
      "Protect existing positions first — hedging takes priority over new entries",
      "Options: rich IV makes premium selling attractive, but tail risk is real — size down",
      "Wait for VIX to stop rising before adding directional exposure",
      "Gap fills and intraday reversals are common — hard stops are non-negotiable",
    ],
  },
  earnings: {
    label:       "Earnings-Driven Market",
    color:       "blue",
    description: "Sector dispersion is high — individual earnings reports are moving stocks significantly while the index stays relatively flat. Stock-picking beats macro bets today.",
    hints: [
      "Index signals are less reliable — focus on individual names with catalyst",
      "Compare each stock's implied move vs actual move for post-earnings edge",
      "Sector rotation is active — check which ETFs are leading vs lagging",
      "Avoid broad index plays; concentration in high-conviction individual names is key",
    ],
  },
};

function scoreRegimes(s: RegimeSignals): Record<Regime, number> {
  const scores: Record<Regime, number> = { trend: 0, chop: 0, panic: 0, earnings: 0 };

  /* ── PANIC ─────────────────────────────────────────────── */
  if (s.vix >= 30)      scores.panic += 45;
  else if (s.vix >= 25) scores.panic += 28;
  else if (s.vix >= 20) scores.panic += 12;
  if (s.vixChange > 8)  scores.panic += 20;
  else if (s.vixChange > 4) scores.panic += 12;
  if (Math.abs(s.spyMove) > 2)    scores.panic += 20;
  else if (Math.abs(s.spyMove) > 1.5) scores.panic += 10;
  if (s.volumeRatio > 1.8)  scores.panic += 15;
  else if (s.volumeRatio > 1.4) scores.panic += 8;
  /* VIX falling strongly is anti-panic */
  if (s.vixChange < -5) scores.panic -= 20;

  /* ── TREND ─────────────────────────────────────────────── */
  if (s.directionalRatio > 0.70) scores.trend += 35;
  else if (s.directionalRatio > 0.55) scores.trend += 20;
  if (Math.abs(s.spyMove) > 1.5)  scores.trend += 25;
  else if (Math.abs(s.spyMove) > 0.8) scores.trend += 15;
  else if (Math.abs(s.spyMove) > 0.5) scores.trend += 6;
  if (s.vix < 15) scores.trend += 15;
  else if (s.vix < 20) scores.trend += 8;
  if (s.volumeRatio > 1.2) scores.trend += 8;
  /* High VIX / low direction kills trend score */
  if (s.vix > 25)              scores.trend -= 20;
  if (s.directionalRatio < 0.35) scores.trend -= 15;

  /* ── CHOP ──────────────────────────────────────────────── */
  if (Math.abs(s.spyMove) < 0.2)       scores.chop += 40;
  else if (Math.abs(s.spyMove) < 0.4)  scores.chop += 25;
  else if (Math.abs(s.spyMove) < 0.6)  scores.chop += 10;
  if (s.directionalRatio < 0.30)        scores.chop += 28;
  else if (s.directionalRatio < 0.45)   scores.chop += 15;
  if (s.vix >= 14 && s.vix <= 22)      scores.chop += 10;
  if (s.volumeRatio < 0.85)            scores.chop += 8;
  /* Strong moves kill chop */
  if (Math.abs(s.spyMove) > 1.0)  scores.chop -= 25;
  if (s.directionalRatio > 0.65)  scores.chop -= 20;

  /* ── EARNINGS ───────────────────────────────────────────── */
  const sectorRange = s.sectorMax - s.sectorMin;
  if (s.sectorDispersion > 1.5)  scores.earnings += 35;
  else if (s.sectorDispersion > 1.0) scores.earnings += 22;
  else if (s.sectorDispersion > 0.7) scores.earnings += 10;
  if (sectorRange > 3.0)  scores.earnings += 20;
  else if (sectorRange > 2.0) scores.earnings += 12;
  /* Flat index but high sector dispersion is the classic earnings signature */
  if (Math.abs(s.spyMove) < 0.8 && s.sectorDispersion > 1.0) scores.earnings += 18;
  if (s.vix >= 15 && s.vix <= 25) scores.earnings += 8;
  /* Very high VIX means macro panic, not earnings-driven */
  if (s.vix > 28) scores.earnings -= 15;

  /* Clamp to [0, 100] */
  for (const k of Object.keys(scores) as Regime[]) {
    scores[k] = Math.max(0, Math.min(100, scores[k]));
  }
  return scores;
}

const QUADRANT_LABELS: Record<Quadrant, string> = {
  "prime":       "Prime Setup",
  "high-stakes": "High Stakes",
  "patient":     "Patient Mode",
  "danger":      "Danger Zone",
};

function computeOpportunity(s: RegimeSignals, regime: Regime): number {
  let opp = 30;

  if (regime === "trend") {
    if (s.directionalRatio > 0.70)      opp += 32;
    else if (s.directionalRatio > 0.55) opp += 18;
    if (Math.abs(s.spyMove) > 1.5)  opp += 22;
    else if (Math.abs(s.spyMove) > 0.8) opp += 13;
    if (s.vix < 15) opp += 15;
    else if (s.vix < 20) opp += 8;
    if (s.volumeRatio > 1.3) opp += 10;
  }

  if (regime === "chop") {
    opp += 18; // premium-selling edge
    if (Math.abs(s.spyMove) < 0.3) opp += 10;
    if (s.vix > 16 && s.vix < 24) opp += 8;
  }

  if (regime === "panic") {
    // Fat premium = opportunity for disciplined sellers, but dangerous
    if (s.vix > 30) opp += 20;
    else if (s.vix > 25) opp += 12;
    opp -= 18; // net: lower opportunity due to chaos
  }

  if (regime === "earnings") {
    if (s.sectorDispersion > 1.5)      opp += 22;
    else if (s.sectorDispersion > 1.0) opp += 13;
    if ((s.sectorMax - s.sectorMin) > 3.0) opp += 10;
  }

  // Bonus: VIX falling into the day = improving conditions
  if (s.vixChange < -3) opp += 8;

  return Math.min(100, Math.max(0, Math.round(opp)));
}

function computeRisk(s: RegimeSignals): number {
  let risk = 15;

  // VIX level — primary risk signal
  if (s.vix >= 30)      risk += 42;
  else if (s.vix >= 25) risk += 28;
  else if (s.vix >= 20) risk += 15;
  else if (s.vix >= 15) risk += 5;

  // VIX momentum — rising fear is worse than high but stable fear
  if (s.vixChange > 8)       risk += 25;
  else if (s.vixChange > 4)  risk += 15;
  else if (s.vixChange > 1)  risk += 5;

  // VIX cooling = risk relief
  if (s.vixChange < -5)      risk -= 18;
  else if (s.vixChange < -2) risk -= 8;

  // Large SPY moves = uncertainty
  if (Math.abs(s.spyMove) > 2.0)    risk += 18;
  else if (Math.abs(s.spyMove) > 1.5) risk += 10;

  // Panic volume on a down day
  if (s.volumeRatio > 1.8 && s.spyMove < -0.5) risk += 12;
  else if (s.volumeRatio > 1.4) risk += 5;

  // High sector dispersion = unpredictable rotations
  if (s.sectorDispersion > 1.5)      risk += 12;
  else if (s.sectorDispersion > 1.0) risk += 6;

  // Low VIX / low vol = controlled environment
  if (s.vix < 14) risk -= 12;

  return Math.min(100, Math.max(0, Math.round(risk)));
}

router.get("/market-regime", async (req, res) => {
  const cacheKey = "market:regime";
  const cached = cache.get(cacheKey);
  if (cached) { res.json(cached); return; }

  try {
    const [spyResult, vixResult, ...sectorResults] = await Promise.allSettled([
      yf.quote("SPY"),
      yf.quote("^VIX"),
      ...SECTOR_ETFS.map((s) => yf.quote(s.symbol)),
    ]);

    /* ── SPY signals ────────────────────────────────────── */
    const spy      = spyResult.status === "fulfilled" ? spyResult.value : null;
    const spyPrice = spy?.regularMarketPrice ?? 0;
    const spyOpen  = (spy as any)?.regularMarketOpen ?? spyPrice;
    const spyHigh  = (spy as any)?.regularMarketDayHigh ?? spyPrice;
    const spyLow   = (spy as any)?.regularMarketDayLow  ?? spyPrice;
    const spyMove  = spy?.regularMarketChangePercent ?? 0;
    const spyVol   = spy?.regularMarketVolume ?? 0;
    const avgVol   = (spy as any)?.averageVolume ?? spyVol;
    const volumeRatio = avgVol > 0 ? spyVol / avgVol : 1;

    const totalRange = spyHigh - spyLow;
    const bodyMove   = spyPrice - spyOpen;
    const directionalRatio = totalRange > 0.001
      ? Math.min(1, Math.abs(bodyMove) / totalRange)
      : 0.5;

    const spyDirection: "bullish" | "bearish" | "flat" =
      spyMove > 0.2 ? "bullish" : spyMove < -0.2 ? "bearish" : "flat";

    /* ── VIX signals ────────────────────────────────────── */
    const vixQ      = vixResult.status === "fulfilled" ? vixResult.value : null;
    const vix       = vixQ?.regularMarketPrice ?? 20;
    const vixChange = vixQ?.regularMarketChangePercent ?? 0;

    /* ── Sector dispersion ──────────────────────────────── */
    const sectorPcts: { name: string; pct: number }[] = [];
    sectorResults.forEach((r, i) => {
      if (r.status !== "fulfilled" || !r.value) return;
      sectorPcts.push({ name: SECTOR_ETFS[i].name, pct: r.value.regularMarketChangePercent ?? 0 });
    });

    const pctValues   = sectorPcts.map((s) => s.pct);
    const sectorMean  = pctValues.length > 0 ? pctValues.reduce((a, b) => a + b, 0) / pctValues.length : 0;
    const sectorDisp  = pctValues.length > 1
      ? Math.sqrt(pctValues.reduce((acc, p) => acc + Math.pow(p - sectorMean, 2), 0) / pctValues.length)
      : 0;

    const sectorsSorted = [...sectorPcts].sort((a, b) => b.pct - a.pct);
    const sectorMax  = sectorsSorted[0]?.pct ?? 0;
    const sectorMin  = sectorsSorted[sectorsSorted.length - 1]?.pct ?? 0;
    const sectorBest = sectorsSorted[0]?.name ?? "—";
    const sectorWorst = sectorsSorted[sectorsSorted.length - 1]?.name ?? "—";

    const signals: RegimeSignals = {
      vix, vixChange, spyMove, spyDirection,
      directionalRatio, volumeRatio, sectorDispersion: sectorDisp,
      sectorMax, sectorMin, sectorBest, sectorWorst,
    };

    /* ── Score & classify ───────────────────────────────── */
    const scores = scoreRegimes(signals);
    const regime = (Object.entries(scores) as [Regime, number][])
      .reduce((best, cur) => cur[1] > best[1] ? cur : best)[0];

    const maxScore = scores[regime];
    const totalScore = Object.values(scores).reduce((a, b) => a + b, 0);
    const confidence = totalScore > 0 ? Math.round((maxScore / totalScore) * 100) : 50;

    const opportunityScore = computeOpportunity(signals, regime);
    const riskScore        = computeRisk(signals);
    const quadrant: Quadrant =
      opportunityScore >= 55 && riskScore <= 45 ? "prime"       :
      opportunityScore >= 55 && riskScore >  45 ? "high-stakes" :
      opportunityScore <  55 && riskScore <= 45 ? "patient"     : "danger";

    const meta = REGIME_META[regime];
    const result: RegimeResult = {
      regime,
      label:           meta.label,
      confidence:      Math.min(confidence, 95),
      opportunityScore,
      riskScore,
      quadrant,
      quadrantLabel:   QUADRANT_LABELS[quadrant],
      scores,
      signals,
      description:     meta.description,
      hints:           meta.hints,
      color:           meta.color,
      updatedAt:       new Date().toISOString(),
    };

    cache.set(cacheKey, result, 5 * 60);
    res.json(result);
  } catch (err) {
    req.log.error(err, "Market regime detection failed");
    res.status(500).json({ error: "Failed to detect market regime" });
  }
});

export default router;
