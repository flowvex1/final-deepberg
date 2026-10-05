import { Router } from "express";
import { yf } from "../lib/yahoo";

const router = Router();

router.get("/watchlist/quotes", async (req, res) => {
  const raw = (req.query.symbols as string) ?? "";
  const symbols = raw
    .split(",")
    .map((s) => s.trim().toUpperCase())
    .filter(Boolean)
    .slice(0, 40);

  if (!symbols.length) {
    res.json([]);
    return;
  }

  try {
    const results = await Promise.allSettled(symbols.map((s) => yf.quote(s)));

    const quotes = symbols.map((symbol, i) => {
      const r = results[i];
      if (r.status !== "fulfilled" || !r.value) {
        return { symbol, error: true };
      }
      const q = r.value;
      return {
        symbol,
        name:          q.longName ?? q.shortName ?? symbol,
        price:         q.regularMarketPrice ?? null,
        change:        q.regularMarketChange ?? null,
        changePercent: q.regularMarketChangePercent ?? null,
        volume:        q.regularMarketVolume ?? null,
        marketCap:     q.marketCap ?? null,
        fiftyTwoWeekLow:  q.fiftyTwoWeekLow ?? null,
        fiftyTwoWeekHigh: q.fiftyTwoWeekHigh ?? null,
      };
    });

    res.json(quotes);
  } catch (err) {
    req.log.error(err, "Watchlist quotes fetch failed");
    res.status(500).json({ error: "Failed to fetch quotes" });
  }
});

export default router;
