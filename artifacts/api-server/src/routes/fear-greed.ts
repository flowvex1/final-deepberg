import { Router } from "express";
import { cache } from "../lib/cache";
import { finnhub } from "../lib/finnhub";
import { yf } from "../lib/yahoo";

const router = Router();

function clamp(val: number, min: number, max: number) {
  return Math.max(min, Math.min(max, val));
}

function lerp(val: number, inMin: number, inMax: number, outMin: number, outMax: number) {
  const t = clamp((val - inMin) / (inMax - inMin), 0, 1);
  return outMin + t * (outMax - outMin);
}

function vixScore(vix: number): number {
  if (vix <= 12)  return lerp(vix, 0, 12, 95, 90);
  if (vix <= 20)  return lerp(vix, 12, 20, 90, 55);
  if (vix <= 30)  return lerp(vix, 20, 30, 55, 20);
  return lerp(vix, 30, 50, 20, 0);
}

function momentumScore(changePercent: number): number {
  return lerp(changePercent, -3, 3, 0, 100);
}

function breadthScore(gainers: number, losers: number): number {
  const total = gainers + losers;
  if (total === 0) return 50;
  return (gainers / total) * 100;
}

function fiftyTwoWeekScore(price: number, low: number, high: number): number {
  if (high <= low) return 50;
  return ((price - low) / (high - low)) * 100;
}

function scoreToLabel(score: number): string {
  if (score >= 75) return "Extreme Greed";
  if (score >= 60) return "Greed";
  if (score >= 40) return "Neutral";
  if (score >= 25) return "Fear";
  return "Extreme Fear";
}

function scoreToColor(score: number): string {
  if (score >= 75) return "#22c55e";
  if (score >= 60) return "#86efac";
  if (score >= 40) return "#facc15";
  if (score >= 25) return "#f97316";
  return "#ef4444";
}

router.get("/fear-greed", async (req, res) => {
  const cacheKey = "fear-greed";
  const cached = cache.get(cacheKey);
  if (cached) { res.json(cached); return; }

  try {
    const [vixResult, spyResult, gainersResult, losersResult] = await Promise.allSettled([
      finnhub.fetchQuote("VIX"),
      yf.quote("SPY"),
      yf.screener("day_gainers", { count: 25 }),
      yf.screener("day_losers", { count: 25 }),
    ]);

    const vix = vixResult.status === "fulfilled" && vixResult.value
      ? vixResult.value.price
      : 20;

    const spyQuote = spyResult.status === "fulfilled" ? spyResult.value : null;
    const spyChangePct = spyQuote?.regularMarketChangePercent ?? 0;
    const spyPrice = spyQuote?.regularMarketPrice ?? 0;
    const spy52wHigh = spyQuote?.fiftyTwoWeekHigh ?? spyPrice;
    const spy52wLow = spyQuote?.fiftyTwoWeekLow ?? spyPrice;

    const gainersCount = gainersResult.status === "fulfilled"
      ? (gainersResult.value?.quotes?.length ?? 10)
      : 10;
    const losersCount = losersResult.status === "fulfilled"
      ? (losersResult.value?.quotes?.length ?? 10)
      : 10;

    const components = {
      vix: {
        label: "Market Volatility (VIX)",
        value: parseFloat(vix.toFixed(2)),
        score: Math.round(vixScore(vix)),
        weight: 0.35,
      },
      momentum: {
        label: "Market Momentum (SPY)",
        value: parseFloat(spyChangePct.toFixed(2)),
        score: Math.round(momentumScore(spyChangePct)),
        weight: 0.30,
      },
      breadth: {
        label: "Market Breadth",
        value: gainersCount,
        score: Math.round(breadthScore(gainersCount, losersCount)),
        weight: 0.20,
      },
      fiftyTwoWeek: {
        label: "52-Week Strength (SPY)",
        value: parseFloat(spyPrice.toFixed(2)),
        score: Math.round(fiftyTwoWeekScore(spyPrice, spy52wLow, spy52wHigh)),
        weight: 0.15,
      },
    };

    const score = Math.round(
      Object.values(components).reduce((sum, c) => sum + c.score * c.weight, 0)
    );

    const result = {
      score,
      label: scoreToLabel(score),
      color: scoreToColor(score),
      vix: parseFloat(vix.toFixed(2)),
      components,
    };

    cache.set(cacheKey, result, 10_000);
    res.json(result);
  } catch (err) {
    req.log.error(err, "Fear & Greed calculation failed");
    res.status(500).json({ error: "Failed to compute Fear & Greed index" });
  }
});

export default router;
