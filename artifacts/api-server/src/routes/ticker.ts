import { Router } from "express";
import { cache } from "../lib/cache";
import { finnhub } from "../lib/finnhub";

const router = Router();

const TAPE_SYMBOLS = [
  "SPY", "QQQ", "AAPL", "NVDA", "TSLA",
  "AMD", "META", "MSFT", "AMZN", "GOOGL",
  "DIA", "VIX",
];

router.get("/ticker-tape", async (req, res) => {
  const cacheKey = "ticker-tape";
  const cached = cache.get(cacheKey);
  if (cached) { res.json(cached); return; }

  try {
    const results = await Promise.allSettled(
      TAPE_SYMBOLS.map((s) => finnhub.fetchQuote(s))
    );

    const tickers = results
      .map((r, i) =>
        r.status === "fulfilled" && r.value ? r.value : null
      )
      .filter(Boolean);

    cache.set(cacheKey, tickers, 10);
    res.json(tickers);
  } catch (err) {
    req.log.error(err, "Ticker tape fetch failed");
    res.status(500).json({ error: "Failed to fetch ticker data" });
  }
});

export default router;
