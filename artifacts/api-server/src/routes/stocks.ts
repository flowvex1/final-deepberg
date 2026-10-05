import { Router } from "express";
import { SearchStocksQueryParams } from "@workspace/api-zod";
import { cache, TTL } from "../lib/cache";
import { yf } from "../lib/yahoo";
import { validateSymbolParam } from "../lib/validation";

const router = Router();
router.param("symbol", validateSymbolParam);

router.get("/stocks/search", async (req, res) => {
  const parsed = SearchStocksQueryParams.safeParse(req.query);
  if (!parsed.success) {
    return res.status(400).json({ error: "Missing query parameter 'q'" });
  }
  const { q } = parsed.data;
  const cacheKey = `search:${q.toLowerCase()}`;

  const cached = cache.get<unknown[]>(cacheKey);
  if (cached) return res.json(cached);

  try {
    const results = await yf.search(q, { newsCount: 0, quotesCount: 8 });
    const quotes = results.quotes
      .filter((r) => r.quoteType === "EQUITY" || r.quoteType === "ETF")
      .slice(0, 8)
      .map((r) => ({
        symbol: r.symbol ?? "",
        name: "longname" in r ? (r.longname ?? r.shortname ?? "") : (r.shortname ?? ""),
        exchange: "exchange" in r ? (r.exchange ?? "") : "",
        type: r.quoteType ?? "",
      }));
    cache.set(cacheKey, quotes, TTL.SEARCH);
    return res.json(quotes);
  } catch (err) {
    req.log.error({ err }, "Stock search failed");
    return res.status(500).json({ error: "Search failed" });
  }
});

router.get("/stocks/:symbol", async (req, res) => {
  const { symbol } = req.params;
  const upper = symbol.toUpperCase();
  const cacheKey = `quote:${upper}`;

  const cached = cache.get<unknown>(cacheKey);
  if (cached) return res.json(cached);

  try {
    const quote = await yf.quote(upper);

    if (!quote || !quote.regularMarketPrice) {
      return res.status(404).json({ error: "Stock not found" });
    }

    const data = {
      symbol: quote.symbol ?? upper,
      name: quote.longName ?? quote.shortName ?? upper,
      price: quote.regularMarketPrice ?? 0,
      change: quote.regularMarketChange ?? 0,
      changePercent: quote.regularMarketChangePercent ?? 0,
      open: quote.regularMarketOpen ?? null,
      high: quote.regularMarketDayHigh ?? null,
      low: quote.regularMarketDayLow ?? null,
      previousClose: quote.regularMarketPreviousClose ?? 0,
      volume: quote.regularMarketVolume ?? null,
      marketCap: quote.marketCap ?? null,
      peRatio: quote.trailingPE ?? null,
      eps: quote.epsTrailingTwelveMonths ?? null,
      dividendYield: quote.trailingAnnualDividendYield
        ? quote.trailingAnnualDividendYield * 100
        : null,
      fiftyTwoWeekHigh: quote.fiftyTwoWeekHigh ?? null,
      fiftyTwoWeekLow: quote.fiftyTwoWeekLow ?? null,
      avgVolume: quote.averageDailyVolume3Month ?? null,
      beta: quote.beta ?? null,
      exchange: quote.fullExchangeName ?? null,
      currency: quote.currency ?? null,
      sector: null,
      industry: null,
    };

    cache.set(cacheKey, data, TTL.QUOTE);
    return res.json(data);
  } catch (err) {
    req.log.error({ err }, "Stock quote fetch failed");
    return res.status(404).json({ error: "Stock not found" });
  }
});

router.get("/stocks/:symbol/history", async (req, res) => {
  const { symbol } = req.params;
  const period = (req.query.period as string) ?? "3mo";
  const upper = symbol.toUpperCase();
  const cacheKey = `history:${upper}:${period}`;

  const cached = cache.get<unknown[]>(cacheKey);
  if (cached) return res.json(cached);

  const periodToInterval: Record<string, string> = {
    "1m": "1m", "5m": "5m", "15m": "15m",
    "1d": "1d", "5d": "1d", "1mo": "1d", "3mo": "1d",
    "6mo": "1d", "1y": "1wk", "2y": "1wk", "5y": "1mo",
  };

  // Intraday periods need a short lookback window
  const intradayPeriodStart: Record<string, () => Date> = {
    "1m":  () => { const d = new Date(); d.setDate(d.getDate() - 1); return d; },
    "5m":  () => { const d = new Date(); d.setDate(d.getDate() - 3); return d; },
    "15m": () => { const d = new Date(); d.setDate(d.getDate() - 7); return d; },
  };

  try {
    const interval = periodToInterval[period] ?? "1d";
    const period1 = intradayPeriodStart[period] ? intradayPeriodStart[period]() : getPeriodStart(period);
    const history = await yf.chart(upper, {
      period1,
      period2: new Date(),
      interval: interval as any,
    });

    const isIntraday = ["1m", "5m", "15m"].includes(period);
    const data = (history.quotes ?? [])
      .filter((q) => q.close != null)
      .map((q) => ({
        date: isIntraday
          ? new Date(q.date).toISOString()         // full ISO for intraday
          : new Date(q.date).toISOString().split("T")[0], // date-only for daily
        open: q.open ?? null,
        high: q.high ?? null,
        low: q.low ?? null,
        close: q.close ?? 0,
        volume: q.volume ?? null,
      }));

    const ttl = ["1m", "5m", "15m"].includes(period) ? 30 : TTL.HISTORY;
    cache.set(cacheKey, data, ttl);
    return res.json(data);
  } catch (err) {
    req.log.error({ err }, "Stock history fetch failed");
    return res.status(404).json({ error: "History not found" });
  }
});

router.get("/stocks/:symbol/earnings", async (req, res) => {
  const { symbol } = req.params;
  const upper    = symbol.toUpperCase();
  const cacheKey = `earnings:${upper}`;

  const cached = cache.get<unknown>(cacheKey);
  if (cached) return res.json(cached);

  try {
    const summary = await yf.quoteSummary(upper, {
      modules: ["earningsHistory", "calendarEvents"] as any,
    });

    const raw: Array<{
      date: string; epsActual: number | null; epsEstimate: number | null;
      surprisePercent: number | null; isFuture: boolean;
    }> = [];

    /* Past earnings from earningsHistory */
    const history: any[] = (summary as any).earningsHistory?.history ?? [];
    for (const e of history.slice(-8)) {
      /* quarter field is a Date or timestamp */
      const qRaw = e.quarter;
      const d    = qRaw ? new Date(qRaw instanceof Date ? qRaw : qRaw * 1000).toISOString().slice(0, 10) : null;
      if (!d) continue;
      const actual   = e.epsActual       != null ? Number(e.epsActual)       : null;
      const estimate = e.epsEstimate     != null ? Number(e.epsEstimate)     : null;
      /* surprisePercent from Yahoo is a fraction (0.2027) — multiply by 100 */
      const surprise = e.surprisePercent != null ? Number(e.surprisePercent) * 100 : null;
      raw.push({ date: d, epsActual: actual, epsEstimate: estimate, surprisePercent: surprise, isFuture: false });
    }

    /* Next upcoming earnings from calendarEvents */
    const cal       = (summary as any).calendarEvents;
    const nextDates: any[] = cal?.earnings?.earningsDate ?? [];
    for (const nd of nextDates) {
      const d = nd ? new Date(nd instanceof Date ? nd : nd * 1000).toISOString().slice(0, 10) : null;
      if (!d) continue;
      if (!raw.some(r => r.date === d)) {
        raw.push({ date: d, epsActual: null, epsEstimate: null, surprisePercent: null, isFuture: true });
      }
    }

    raw.sort((a, b) => a.date.localeCompare(b.date));
    cache.set(cacheKey, raw, 60 * 60);
    return res.json(raw);
  } catch (err) {
    req.log.error({ err }, "Earnings fetch failed");
    return res.json([]);
  }
});

router.get("/stocks/:symbol/news", async (req, res) => {
  const { symbol } = req.params;
  const upper = symbol.toUpperCase();
  const cacheKey = `news:${upper}`;

  const cached = cache.get<unknown[]>(cacheKey);
  if (cached) return res.json(cached);

  try {
    const results = await yf.search(upper, { newsCount: 10, quotesCount: 0 });
    const news = (results.news ?? []).slice(0, 10).map((n) => ({
      title: n.title ?? "",
      publisher: n.publisher ?? "",
      link: n.link ?? "",
      publishedAt: n.providerPublishTime
        ? new Date(n.providerPublishTime).toISOString()
        : new Date().toISOString(),
      thumbnail: n.thumbnail?.resolutions?.[0]?.url ?? null,
      summary: null,
    }));
    cache.set(cacheKey, news, TTL.NEWS);
    return res.json(news);
  } catch (err) {
    req.log.error({ err }, "Stock news fetch failed");
    return res.json([]);
  }
});

router.get("/stocks/:symbol/confidence", async (req, res) => {
  const { symbol } = req.params;
  const upper    = symbol.toUpperCase();
  const cacheKey = `confidence:${upper}`;

  const cached = cache.get<unknown>(cacheKey);
  if (cached) return res.json(cached);

  try {
    const [quoteR, histR] = await Promise.allSettled([
      yf.quote(upper),
      yf.chart(upper, {
        period1: (() => { const d = new Date(); d.setDate(d.getDate() - 65); return d; })(),
        period2: new Date(),
        interval: "1d",
      }),
    ]);

    if (quoteR.status === "rejected" || !quoteR.value?.regularMarketPrice) {
      return res.status(404).json({ error: "Stock not found" });
    }

    const q      = quoteR.value;
    const closes = histR.status === "fulfilled"
      ? (histR.value.quotes ?? []).filter(h => h.close != null).map(h => h.close as number)
      : [];
    const vols   = histR.status === "fulfilled"
      ? (histR.value.quotes ?? []).filter(h => h.volume != null).map(h => h.volume as number)
      : [];

    const clamp = (n: number) => Math.min(100, Math.max(0, Math.round(n)));
    const avg   = (arr: number[]) => arr.length ? arr.reduce((a,b)=>a+b,0)/arr.length : 0;

    /* ── SMA helpers ──────────────────────────────────────── */
    const sma20 = closes.length >= 20 ? avg(closes.slice(-20)) : null;
    const sma50 = closes.length >= 50 ? avg(closes.slice(-50)) : null;
    const price = q.regularMarketPrice as number;

    /* ── Momentum ─────────────────────────────────────────── */
    const mom5d  = closes.length >= 5  ? (price - closes[closes.length-5])  / closes[closes.length-5]  * 100 : 0;
    const mom20d = closes.length >= 20 ? (price - closes[closes.length-20]) / closes[closes.length-20] * 100 : 0;

    /* ── 52W position (0-1) ───────────────────────────────── */
    const w52Lo  = q.fiftyTwoWeekLow  ?? price;
    const w52Hi  = q.fiftyTwoWeekHigh ?? price;
    const w52Rng = w52Hi - w52Lo || 1;
    const w52Pos = (price - w52Lo) / w52Rng;

    /* ══════════════════════════════════════════════════════
       TREND STRENGTH  (higher = stronger uptrend)
    ══════════════════════════════════════════════════════ */
    let trendScore = 40; /* neutral baseline */
    if (sma20 !== null && sma50 !== null) {
      if (price > sma20 && sma20 > sma50)        trendScore += 25; /* ideal alignment */
      else if (price > sma20)                     trendScore += 12;
      else if (price < sma20 && sma20 < sma50)   trendScore -= 25; /* bearish stack */
      else if (price < sma20)                     trendScore -= 12;
    }
    if (mom5d  > 4)       trendScore += 18;
    else if (mom5d  > 1)  trendScore += 10;
    else if (mom5d  < -4) trendScore -= 18;
    else if (mom5d  < -1) trendScore -= 10;

    if (mom20d > 8)       trendScore += 14;
    else if (mom20d > 3)  trendScore += 8;
    else if (mom20d < -8) trendScore -= 14;
    else if (mom20d < -3) trendScore -= 8;

    trendScore += Math.round((w52Pos - 0.5) * 20); /* +10 if near yearly high, -10 if near low */
    trendScore  = clamp(trendScore);

    const trendVerdict = trendScore >= 75 ? "Strong uptrend — price is well above key averages"
      : trendScore >= 55 ? "Moderate uptrend — mostly positive momentum"
      : trendScore >= 40 ? "No clear direction — going sideways"
      : trendScore >= 25 ? "Weakening — price below short-term averages"
      :                    "Downtrend — price below both key averages";

    /* ══════════════════════════════════════════════════════
       VOLUME SUPPORT  (higher = volume confirms move)
    ══════════════════════════════════════════════════════ */
    const todayVol  = q.regularMarketVolume ?? 0;
    const avgVol    = (q.averageDailyVolume3Month ?? q.averageDailyVolume10Day ?? todayVol) || 1;
    const volRatio  = todayVol / avgVol;
    const priceUp   = (q.regularMarketChangePercent ?? 0) >= 0;

    /* Recent volume trend: are last 5 days consistently higher-than-average? */
    const recentVols   = vols.slice(-5);
    const histAvgVol   = avg(vols.slice(0, -5)) || avgVol;
    const highVolDays  = recentVols.filter(v => v > histAvgVol * 1.1).length;

    let volScore = 40;
    if (priceUp) {
      if (volRatio >= 2.0)     volScore += 30;
      else if (volRatio >= 1.5) volScore += 20;
      else if (volRatio >= 1.0) volScore += 10;
      else                      volScore -= 10; /* low vol on up day = weak */
    } else {
      if (volRatio >= 2.0)     volScore -= 25; /* heavy selling */
      else if (volRatio >= 1.5) volScore -= 15;
      else                      volScore += 10; /* low vol on down day = weak selling */
    }
    volScore += highVolDays * 4; /* bonus for sustained volume */
    volScore  = clamp(volScore);

    const volVerdict = volScore >= 75 ? "Strong — high volume confirms today's move is real"
      : volScore >= 55 ? "Decent — above-average buying activity backing the move"
      : volScore >= 40 ? "Thin — volume isn't strongly confirming price direction"
      : volScore >= 25 ? "Weak — price moving without volume support"
      :                  "Concerning — heavy selling volume on a down day";

    /* ══════════════════════════════════════════════════════
       VOLATILITY RISK  (higher = riskier / more volatile)
    ══════════════════════════════════════════════════════ */
    const beta      = q.beta ?? 1;
    /* ATR approximation: avg of last 10 daily high-low ranges as % of price */
    const atrPct = histR.status === "fulfilled" ? (() => {
      const bars = (histR.value.quotes ?? []).slice(-10).filter(b => b.high != null && b.low != null);
      if (!bars.length) return 3;
      return avg(bars.map(b => ((b.high as number) - (b.low as number)) / (b.close as number) * 100));
    })() : 3;

    const w52Breadth = (w52Hi - w52Lo) / ((w52Hi + w52Lo) / 2) * 100; /* how wide the yearly range is */

    let riskScore = 30;
    if (beta >= 2.5)       riskScore += 45;
    else if (beta >= 2.0)  riskScore += 35;
    else if (beta >= 1.5)  riskScore += 22;
    else if (beta >= 1.2)  riskScore += 12;
    else if (beta <= 0.6)  riskScore -= 15;

    if (atrPct >= 6)       riskScore += 20;
    else if (atrPct >= 4)  riskScore += 10;
    else if (atrPct <= 1.5) riskScore -= 10;

    if (w52Breadth >= 80)  riskScore += 15;
    else if (w52Breadth >= 50) riskScore += 8;

    riskScore = clamp(riskScore);

    const riskVerdict = riskScore >= 75 ? `Very high risk — moves ${beta.toFixed(1)}× faster than the market`
      : riskScore >= 60 ? `High risk — volatile stock, expect large swings`
      : riskScore >= 40 ? `Moderate risk — moves a bit faster than average`
      : riskScore >= 25 ? `Low risk — relatively calm and stable`
      :                   `Very low risk — one of the most stable stocks`;

    /* ══════════════════════════════════════════════════════
       OVERALL CONFIDENCE
    ══════════════════════════════════════════════════════ */
    const overall = clamp(0.40 * trendScore + 0.35 * volScore + 0.25 * (100 - riskScore));

    const verdict      = overall >= 75 ? "Strong setup" : overall >= 60 ? "Decent setup" : overall >= 45 ? "Mixed signals" : overall >= 30 ? "Weak setup" : "Avoid for now";
    const verdictColor = overall >= 75 ? "emerald"      : overall >= 60 ? "blue"         : overall >= 45 ? "amber"         : "red";
    const action       = overall >= 70 ? "buy"          : overall >= 50 ? "watch"        : "skip";

    const result = {
      symbol: upper, overall, verdict, verdictColor, action,
      factors: [
        {
          name: "Trend Strength", score: trendScore,
          verdict: trendVerdict,
          detail: sma20 !== null ? `5-day momentum: ${mom5d >= 0 ? "+" : ""}${mom5d.toFixed(1)}%  ·  vs year: ${(w52Pos*100).toFixed(0)}% of range` : "Not enough history",
          color: trendScore >= 60 ? "emerald" : trendScore >= 40 ? "amber" : "red",
          isRisk: false,
        },
        {
          name: "Volume Support", score: volScore,
          verdict: volVerdict,
          detail: `Today: ${volRatio.toFixed(1)}× normal volume  ·  ${highVolDays}/5 recent days above avg`,
          color: volScore >= 60 ? "blue" : volScore >= 40 ? "amber" : "red",
          isRisk: false,
        },
        {
          name: "Volatility Risk", score: riskScore,
          verdict: riskVerdict,
          detail: `Beta ${beta.toFixed(2)}  ·  Avg daily range ${atrPct.toFixed(1)}%  ·  52W breadth ${w52Breadth.toFixed(0)}%`,
          color: riskScore <= 35 ? "emerald" : riskScore <= 55 ? "amber" : "red",
          isRisk: true,
        },
      ],
      raw: { beta, volRatio: parseFloat(volRatio.toFixed(2)), mom5d: parseFloat(mom5d.toFixed(2)), mom20d: parseFloat(mom20d.toFixed(2)), w52Pos: parseFloat(w52Pos.toFixed(3)), atrPct: parseFloat(atrPct.toFixed(2)) },
    };

    cache.set(cacheKey, result, 5 * 60);
    return res.json(result);
  } catch (err) {
    req.log.error({ err }, "Confidence score failed");
    return res.status(500).json({ error: "Failed to compute confidence score" });
  }
});

function getPeriodStart(period: string): Date {
  const map: Record<string, number> = {
    "1d": 1, "5d": 5, "1mo": 30, "3mo": 90,
    "6mo": 180, "1y": 365, "2y": 730, "5y": 1825,
  };
  const d = new Date();
  d.setDate(d.getDate() - (map[period] ?? 90));
  return d;
}

export default router;
