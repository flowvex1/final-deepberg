import { Router } from "express";
import { cache } from "../lib/cache";
import { yf } from "../lib/yahoo";
import { validateSymbolParam } from "../lib/validation";

const router = Router();
router.param("symbol", validateSymbolParam);

router.get("/options-heatmap/:symbol", async (req, res) => {
  const symbol   = req.params.symbol.toUpperCase();
  const cacheKey = `options:heatmap:${symbol}`;

  const cached = cache.get(cacheKey);
  if (cached) { res.json(cached); return; }

  try {
    const [quoteR, initialR] = await Promise.allSettled([
      yf.quote(symbol),
      yf.options(symbol),
    ]);

    if (quoteR.status === "rejected" || !(quoteR.value as any)?.regularMarketPrice) {
      res.status(404).json({ error: `Symbol ${symbol} not found` });
      return;
    }

    const q            = quoteR.value as any;
    const currentPrice = q.regularMarketPrice as number;

    const rawDates: Date[] = initialR.status === "fulfilled"
      ? (initialR.value as any).expirationDates ?? []
      : [];

    /* Take the first 7 upcoming expirations */
    const expDates = rawDates.slice(0, 7);

    if (expDates.length === 0) {
      res.status(404).json({ error: "No options data available" });
      return;
    }

    /* Fetch all expirations in parallel */
    const chainResults = await Promise.allSettled(
      expDates.map((d) => yf.options(symbol, { date: d }))
    );

    /* Build grid ─────────────────────────────────────────────── */
    const expirationList: string[] = [];
    const strikeSet                = new Set<number>();
    const cells: Record<string, {
      callVolume: number; putVolume: number;
      callOI: number;    putOI: number;
      callIV: number | null; putIV: number | null;
      imbalance: number; totalVolume: number;
    }> = {};
    let maxVolume = 1;

    const RANGE = 0.22; /* ±22% of current price */

    chainResults.forEach((r, i) => {
      if (r.status !== "fulfilled") return;
      const chain  = (r.value as any);
      const expRaw = expDates[i];
      const expStr = expRaw instanceof Date
        ? expRaw.toISOString().slice(0, 10)
        : String(expRaw).slice(0, 10);

      if (!expirationList.includes(expStr)) expirationList.push(expStr);

      const calls: any[] = chain.options?.[0]?.calls ?? [];
      const puts:  any[] = chain.options?.[0]?.puts  ?? [];

      const putMap = new Map<number, any>(puts.map((p: any) => [p.strike, p]));

      for (const call of calls) {
        const strike = call.strike as number;
        if (Math.abs(strike - currentPrice) / currentPrice > RANGE) continue;

        strikeSet.add(strike);
        const put     = putMap.get(strike);
        const callVol = Number(call.volume ?? 0);
        const putVol  = Number(put?.volume ?? 0);
        const total   = callVol + putVol;

        maxVolume = Math.max(maxVolume, total);

        const key = `${strike}-${expStr}`;
        cells[key] = {
          callVolume:  callVol,
          putVolume:   putVol,
          callOI:      Number(call.openInterest ?? 0),
          putOI:       Number(put?.openInterest ?? 0),
          callIV:      call.impliedVolatility != null ? Number(call.impliedVolatility) : null,
          putIV:       put?.impliedVolatility  != null ? Number(put.impliedVolatility)  : null,
          imbalance:   total > 0 ? (callVol - putVol) / total : 0,
          totalVolume: total,
        };
      }
    });

    /* Sort strikes descending (high → low, so calls are near top) */
    const strikes = Array.from(strikeSet).sort((a, b) => b - a);

    /* Summary stats */
    let totalCalls = 0, totalPuts = 0;
    let bullishCell = { strike: 0, exp: "", vol: 0 };
    let bearishCell = { strike: 0, exp: "", vol: 0 };

    for (const [key, cell] of Object.entries(cells)) {
      totalCalls += cell.callVolume;
      totalPuts  += cell.putVolume;
      if (cell.callVolume > bullishCell.vol) {
        const [s, e] = key.split("-20");
        bullishCell = { strike: Number(s), exp: `20${e}`, vol: cell.callVolume };
      }
      if (cell.putVolume > bearishCell.vol) {
        const [s, e] = key.split("-20");
        bearishCell = { strike: Number(s), exp: `20${e}`, vol: cell.putVolume };
      }
    }

    /* Rough max-pain: strike where total option value (OI × price distance) is minimized */
    let minPain = Infinity, maxPainStrike = currentPrice;
    for (const s of strikes) {
      let pain = 0;
      for (const exp of expirationList) {
        const c = cells[`${s}-${exp}`];
        if (!c) continue;
        pain += c.callOI * Math.max(0, currentPrice - s);
        pain += c.putOI  * Math.max(0, s - currentPrice);
      }
      if (pain < minPain) { minPain = pain; maxPainStrike = s; }
    }

    const result = {
      symbol,
      currentPrice,
      expirations:    expirationList.sort(),
      strikes,
      maxVolume,
      cells,
      totalCalls,
      totalPuts,
      putCallRatio:   totalCalls > 0 ? parseFloat((totalPuts / totalCalls).toFixed(2)) : null,
      bullishStrike:  bullishCell.strike || null,
      bearishStrike:  bearishCell.strike || null,
      maxPainStrike,
      updatedAt:      new Date().toISOString(),
    };

    cache.set(cacheKey, result, 3 * 60);
    res.json(result);
  } catch (err) {
    req.log.error(err, "Options heatmap failed");
    res.status(500).json({ error: "Failed to fetch chain data" });
  }
});

export default router;
