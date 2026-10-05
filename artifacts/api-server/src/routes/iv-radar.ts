import { Router } from "express";
import { yf } from "../lib/yahoo";
import { cache } from "../lib/cache";

const router = Router();

const DEFAULT_WATCHLIST = ["NVDA", "TSLA", "AMD", "AAPL", "SPY", "QQQ", "META", "MSFT"];

function computeHV(closes: number[], days: number): number {
  if (closes.length < days + 1) return 0;
  const recent = closes.slice(-days - 1);
  const returns = recent.slice(1).map((p, i) => Math.log(p / recent[i]));
  const mean = returns.reduce((a, b) => a + b, 0) / returns.length;
  const variance = returns.reduce((sum, r) => sum + Math.pow(r - mean, 2), 0) / returns.length;
  return Math.sqrt(variance) * Math.sqrt(252) * 100;
}

function getATMIV(contracts: any[], currentPrice: number): number {
  if (!contracts || !contracts.length) return 0;
  const sorted = [...contracts].sort(
    (a, b) => Math.abs(a.strike - currentPrice) - Math.abs(b.strike - currentPrice)
  );
  const best = sorted[0];
  return (best?.impliedVolatility ?? 0) * 100;
}

function approxIVRank(ivHvRatio: number): number {
  return Math.round(100 / (1 + Math.exp(-(ivHvRatio - 1.5) * 2)));
}

async function fetchIVData(symbol: string) {
  const cacheKey = `iv:${symbol}`;
  const cached = cache.get(cacheKey);
  if (cached) return cached;

  try {
    const [quote, expResult] = await Promise.all([
      yf.quote(symbol),
      yf.options(symbol),
    ]);

    if (!quote || !quote.regularMarketPrice) {
      return { symbol, price: 0, currentIV: 0, hv30: 0, hv60: 0, ivHvRatio: 0, ivRank: 0, termSlope: 0, volume: 0, avgVolume: 0, volumeRatio: 1, changePercent: 0, error: "Quote unavailable" };
    }

    const price = quote.regularMarketPrice;
    const volume = quote.regularMarketVolume ?? 0;
    const avgVolume = quote.averageDailyVolume3Month ?? quote.averageDailyVolume10Day ?? 1;
    const changePercent = quote.regularMarketChangePercent ?? 0;

    const rawDates: Date[] = (expResult as any).expirationDates ?? [];
    if (!rawDates.length) {
      return { symbol, price, currentIV: 0, hv30: 0, hv60: 0, ivHvRatio: 0, ivRank: 0, termSlope: 0, volume, avgVolume, volumeRatio: volume / avgVolume, changePercent, error: "No options" };
    }

    const now = Date.now();
    const target30 = now + 30 * 86400000;
    const target90 = now + 90 * 86400000;

    const nearDate = rawDates.reduce((best, d) =>
      Math.abs(d.getTime() - target30) < Math.abs(best.getTime() - target30) ? d : best
    );
    const farDate = rawDates.reduce((best, d) =>
      Math.abs(d.getTime() - target90) < Math.abs(best.getTime() - target90) ? d : best
    );

    const [nearChain, farChain, histResult] = await Promise.all([
      yf.options(symbol, { date: nearDate }),
      nearDate.getTime() !== farDate.getTime() ? yf.options(symbol, { date: farDate }) : Promise.resolve(null),
      yf.chart(symbol, { period1: new Date(now - 365 * 86400000), period2: new Date(now), interval: "1d" }),
    ]);

    const nearOptions = (nearChain as any).options?.[0] ?? {};
    const nearCallIV = getATMIV(nearOptions.calls ?? [], price);
    const nearPutIV = getATMIV(nearOptions.puts ?? [], price);
    const currentIV = (nearCallIV + nearPutIV) / 2;

    let termSlope = 0;
    if (farChain) {
      const farOptions = (farChain as any).options?.[0] ?? {};
      const farCallIV = getATMIV(farOptions.calls ?? [], price);
      const farPutIV = getATMIV(farOptions.puts ?? [], price);
      const farIV = (farCallIV + farPutIV) / 2;
      termSlope = currentIV - farIV;
    }

    const closes: number[] = (histResult.quotes ?? [])
      .map((q: any) => q.close)
      .filter((c: any) => c != null && !isNaN(c));

    const hv30 = computeHV(closes, 30);
    const hv60 = computeHV(closes, 60);
    const ivHvRatio = hv30 > 0 ? currentIV / hv30 : 0;
    const ivRank = approxIVRank(ivHvRatio);

    const result = {
      symbol,
      price,
      currentIV: Math.round(currentIV * 10) / 10,
      hv30: Math.round(hv30 * 10) / 10,
      hv60: Math.round(hv60 * 10) / 10,
      ivHvRatio: Math.round(ivHvRatio * 100) / 100,
      ivRank,
      termSlope: Math.round(termSlope * 10) / 10,
      volume,
      avgVolume,
      volumeRatio: Math.round((volume / (avgVolume || 1)) * 100) / 100,
      changePercent: Math.round(changePercent * 100) / 100,
      error: null,
    };

    cache.set(cacheKey, result, 600);
    return result;
  } catch (err) {
    return { symbol, price: 0, currentIV: 0, hv30: 0, hv60: 0, ivHvRatio: 0, ivRank: 0, termSlope: 0, volume: 0, avgVolume: 0, volumeRatio: 1, changePercent: 0, error: String(err) };
  }
}

router.get("/iv-radar", async (req, res) => {
  const symbolsParam = req.query.symbols as string | undefined;
  const symbols = symbolsParam
    ? symbolsParam.split(",").map((s) => s.trim().toUpperCase()).filter(Boolean).slice(0, 20)
    : DEFAULT_WATCHLIST;

  try {
    const results = await Promise.all(symbols.map(fetchIVData));
    res.json(results);
  } catch (err) {
    req.log.error(err, "Failed to fetch IV radar");
    res.status(500).json({ error: "Failed to fetch IV radar data" });
  }
});

export default router;
