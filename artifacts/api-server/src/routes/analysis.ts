import { Router } from "express";
import { openai, AI_MODEL, AI_ENABLED } from "@workspace/integrations-openai-ai-server";
import { cache, TTL } from "../lib/cache";
import { yf } from "../lib/yahoo";
import { validateSymbolParam } from "../lib/validation";

const router = Router();
router.param("symbol", validateSymbolParam);

router.get("/market/movers", async (req, res) => {
  const cacheKey = "market:movers";
  const cached = cache.get<unknown>(cacheKey);
  if (cached) return res.json(cached);

  try {
    const [gainers, losers, active] = await Promise.allSettled([
      yf.screener("day_gainers", { count: 5 }),
      yf.screener("day_losers", { count: 5 }),
      yf.screener("most_actives", { count: 5 }),
    ]);

    type ScreenerResult = Awaited<ReturnType<typeof yf.screener>>;

    const mapScreener = (r: PromiseSettledResult<ScreenerResult>) => {
      if (r.status === "rejected") return [];
      return (r.value.quotes ?? []).slice(0, 5).map((q) => ({
        symbol: q.symbol ?? "",
        name: q.longName ?? q.shortName ?? q.symbol ?? "",
        price: q.regularMarketPrice ?? 0,
        change: q.regularMarketChange ?? 0,
        changePercent: q.regularMarketChangePercent ?? 0,
        volume: q.regularMarketVolume ?? null,
      }));
    };

    const data = {
      gainers: mapScreener(gainers),
      losers: mapScreener(losers),
      mostActive: mapScreener(active),
    };

    cache.set(cacheKey, data, TTL.MOVERS);
    return res.json(data);
  } catch (err) {
    req.log.error({ err }, "Market movers fetch failed");
    return res.json({ gainers: [], losers: [], mostActive: [] });
  }
});

router.post("/analysis/:symbol", async (req, res) => {
  if (!AI_ENABLED) { res.status(503).json({ error: "AI analysis is not configured for this deployment" }); return; }
  const { symbol } = req.params;
  const upper = symbol.toUpperCase();
  const cacheKey = `analysis:${upper}`;

  const cached = cache.get<unknown>(cacheKey);
  if (cached) return res.json(cached);

  try {
    const [quoteResult, historyResult, newsResult] = await Promise.allSettled([
      yf.quote(upper),
      yf.chart(upper, {
        period1: (() => { const d = new Date(); d.setDate(d.getDate() - 90); return d; })(),
        period2: new Date(),
        interval: "1d",
      }),
      yf.search(upper, { newsCount: 5, quotesCount: 0 }),
    ]);

    if (quoteResult.status === "rejected" || !quoteResult.value?.regularMarketPrice) {
      return res.status(404).json({ error: "Stock not found" });
    }

    const q = quoteResult.value;
    const historyData = historyResult.status === "fulfilled"
      ? (historyResult.value.quotes ?? []).filter((h) => h.close != null)
      : [];
    const headlines = newsResult.status === "fulfilled"
      ? (newsResult.value.news ?? []).slice(0, 5).map((n) => `- ${n.title}`).join("\n")
      : "";

    const prices = historyData.map((h) => h.close ?? 0).filter(Boolean);
    const latestPrice = q.regularMarketPrice ?? 0;
    const priceChange = q.regularMarketChangePercent ?? 0;
    const high52 = q.fiftyTwoWeekHigh ?? null;
    const low52 = q.fiftyTwoWeekLow ?? null;
    const pe = q.trailingPE ?? null;
    const marketCap = q.marketCap ?? null;
    const volume = q.regularMarketVolume ?? null;
    const avgVolume = q.averageDailyVolume3Month ?? null;
    const recentTrend = prices.length >= 6
      ? ((prices[prices.length - 1] - prices[prices.length - 6]) / prices[prices.length - 6]) * 100
      : 0;

    const prompt = `You are a professional stock market analyst. Analyze the following data and explain what's driving this stock.

Stock: ${q.longName ?? q.shortName ?? upper} (${upper})
Current Price: $${latestPrice.toFixed(2)}
Today's Change: ${priceChange.toFixed(2)}%
5-Day Trend: ${recentTrend.toFixed(2)}%
52-Week High: ${high52 ? `$${high52.toFixed(2)}` : "N/A"}
52-Week Low: ${low52 ? `$${low52.toFixed(2)}` : "N/A"}
P/E Ratio: ${pe ? pe.toFixed(2) : "N/A"}
Market Cap: ${marketCap ? `$${(marketCap / 1e9).toFixed(2)}B` : "N/A"}
Volume: ${volume ? volume.toLocaleString() : "N/A"} (Avg: ${avgVolume ? avgVolume.toLocaleString() : "N/A"})
${headlines ? `\nRecent News Headlines:\n${headlines}` : ""}

Respond ONLY with valid JSON (no markdown):
{
  "summary": "2-3 sentence executive summary explaining why the stock is moving",
  "whyMoving": "1-2 sentences directly explaining the catalyst or reason for today's price action",
  "sentiment": "bullish"|"bearish"|"neutral",
  "sentimentScore": number -1.0 to 1.0,
  "keyStrengths": ["strength 1","strength 2","strength 3"],
  "keyRisks": ["risk 1","risk 2","risk 3"],
  "technicalOutlook": "1-2 sentences on price action and chart patterns",
  "fundamentalOutlook": "1-2 sentences on valuation and business fundamentals",
  "tradeSetups": "1-2 sentences on possible trade setups (not financial advice)",
  "recommendation": "strong_buy"|"buy"|"hold"|"sell"|"strong_sell",
  "priceTarget": number or null
}`;

    const completion = await openai.chat.completions.create({
      model: AI_MODEL,
      response_format: { type: "json_object" },
      max_completion_tokens: 1024,
      messages: [{ role: "user", content: prompt }],
    });

    const raw = completion.choices[0]?.message?.content ?? "{}";
    let analysis: Record<string, unknown>;
    try {
      analysis = JSON.parse(raw);
    } catch {
      const jsonMatch = raw.match(/\{[\s\S]*\}/);
      analysis = jsonMatch ? JSON.parse(jsonMatch[0]) : {};
    }

    const data = {
      symbol: upper,
      summary: analysis.summary ?? "Analysis unavailable.",
      whyMoving: analysis.whyMoving ?? null,
      sentiment: analysis.sentiment ?? "neutral",
      sentimentScore: analysis.sentimentScore ?? 0,
      keyStrengths: analysis.keyStrengths ?? [],
      keyRisks: analysis.keyRisks ?? [],
      technicalOutlook: analysis.technicalOutlook ?? "",
      fundamentalOutlook: analysis.fundamentalOutlook ?? "",
      tradeSetups: analysis.tradeSetups ?? null,
      recommendation: analysis.recommendation ?? "hold",
      priceTarget: analysis.priceTarget ?? null,
      generatedAt: new Date().toISOString(),
    };

    cache.set(cacheKey, data, TTL.ANALYSIS);
    return res.json(data);
  } catch (err) {
    req.log.error({ err }, "Stock analysis failed");
    return res.status(500).json({ error: "Analysis failed" });
  }
});

router.post("/analysis/:symbol/longterm", async (req, res) => {
  if (!AI_ENABLED) { res.status(503).json({ error: "AI analysis is not configured for this deployment" }); return; }
  const { symbol } = req.params;
  const upper = symbol.toUpperCase();
  const cacheKey = `analysis:longterm:${upper}`;
  const cached = cache.get<unknown>(cacheKey);
  if (cached) return res.json(cached);

  try {
    const [quoteResult, historyResult, newsResult] = await Promise.allSettled([
      yf.quote(upper),
      yf.chart(upper, {
        period1: (() => { const d = new Date(); d.setFullYear(d.getFullYear() - 2); return d; })(),
        period2: new Date(), interval: "1wk",
      }),
      yf.search(upper, { newsCount: 5, quotesCount: 0 }),
    ]);

    if (quoteResult.status === "rejected" || !quoteResult.value?.regularMarketPrice) {
      return res.status(404).json({ error: "Stock not found" });
    }
    const q = quoteResult.value;
    const prices = historyResult.status === "fulfilled"
      ? (historyResult.value.quotes ?? []).filter((h) => h.close != null).map((h) => h.close ?? 0)
      : [];
    const headlines = newsResult.status === "fulfilled"
      ? (newsResult.value.news ?? []).slice(0, 5).map((n) => `- ${n.title}`).join("\n") : "";

    const yearReturn = prices.length >= 52
      ? ((prices[prices.length - 1] - prices[prices.length - 52]) / prices[prices.length - 52] * 100).toFixed(1)
      : "N/A";

    const prompt = `You are a long-term equity research analyst at a top investment bank. Analyze ${q.longName ?? upper} (${upper}) for a multi-year holding period.

Current Price: $${(q.regularMarketPrice ?? 0).toFixed(2)}
Market Cap: ${q.marketCap ? `$${(q.marketCap / 1e9).toFixed(1)}B` : "N/A"}
P/E Ratio: ${q.trailingPE?.toFixed(1) ?? "N/A"}
EPS: ${q.epsTrailingTwelveMonths?.toFixed(2) ?? "N/A"}
52-Week Range: $${q.fiftyTwoWeekLow?.toFixed(2) ?? "N/A"} – $${q.fiftyTwoWeekHigh?.toFixed(2) ?? "N/A"}
2-Year Price Return: ${yearReturn}%
Dividend Yield: ${q.trailingAnnualDividendYield ? `${(q.trailingAnnualDividendYield * 100).toFixed(2)}%` : "None"}

Recent News:
${headlines}

Write a long-term investment thesis (1-5 year horizon). Respond ONLY with valid JSON:
{
  "thesis": "3-4 sentence core long-term investment case — growth drivers, competitive moat, industry tailwinds",
  "growthCatalysts": ["catalyst 1", "catalyst 2", "catalyst 3"],
  "longTermRisks": ["risk 1", "risk 2", "risk 3"],
  "valuationView": "1-2 sentences on whether the stock looks cheap, fair, or expensive for long-term buyers",
  "futureOutlook": "2-3 sentences on where this company could be in 3-5 years",
  "sentiment": "bullish"|"bearish"|"neutral",
  "priceTarget1Y": number or null,
  "priceTarget3Y": number or null
}`;

    const completion = await openai.chat.completions.create({
      model: AI_MODEL, max_completion_tokens: 900,
      response_format: { type: "json_object" },
      messages: [{ role: "user", content: prompt }],
    });
    const raw = completion.choices[0]?.message?.content ?? "{}";
    let parsed: Record<string, unknown>;
    try { parsed = JSON.parse(raw); }
    catch { const m = raw.match(/\{[\s\S]*\}/); parsed = m ? JSON.parse(m[0]) : {}; }

    const data = {
      symbol: upper,
      thesis: parsed.thesis ?? "Thesis unavailable.",
      growthCatalysts: parsed.growthCatalysts ?? [],
      longTermRisks: parsed.longTermRisks ?? [],
      valuationView: parsed.valuationView ?? "",
      futureOutlook: parsed.futureOutlook ?? "",
      sentiment: parsed.sentiment ?? "neutral",
      priceTarget1Y: parsed.priceTarget1Y ?? null,
      priceTarget3Y: parsed.priceTarget3Y ?? null,
      generatedAt: new Date().toISOString(),
    };
    cache.set(cacheKey, data, TTL.ANALYSIS);
    return res.json(data);
  } catch (err) {
    req.log.error({ err }, "Long-term analysis failed");
    return res.status(500).json({ error: "Analysis failed" });
  }
});

router.post("/analysis/:symbol/swing", async (req, res) => {
  if (!AI_ENABLED) { res.status(503).json({ error: "AI analysis is not configured for this deployment" }); return; }
  const { symbol } = req.params;
  const upper = symbol.toUpperCase();
  const cacheKey = `analysis:swing:${upper}`;
  const cached = cache.get<unknown>(cacheKey);
  if (cached) return res.json(cached);

  try {
    const [quoteResult, historyResult] = await Promise.allSettled([
      yf.quote(upper),
      yf.chart(upper, {
        period1: (() => { const d = new Date(); d.setDate(d.getDate() - 60); return d; })(),
        period2: new Date(), interval: "1d",
      }),
    ]);

    if (quoteResult.status === "rejected" || !quoteResult.value?.regularMarketPrice) {
      return res.status(404).json({ error: "Stock not found" });
    }
    const q = quoteResult.value;
    const history = historyResult.status === "fulfilled"
      ? (historyResult.value.quotes ?? []).filter((h) => h.close != null) : [];
    const closes = history.map((h) => h.close ?? 0);
    const highs  = history.map((h) => h.high ?? 0);
    const lows   = history.map((h) => h.low ?? 0);

    const sma20 = closes.length >= 20
      ? (closes.slice(-20).reduce((a, b) => a + b, 0) / 20).toFixed(2) : "N/A";
    const sma50 = closes.length >= 50
      ? (closes.slice(-50).reduce((a, b) => a + b, 0) / 50).toFixed(2) : "N/A";
    const recentHigh = highs.slice(-20).length ? Math.max(...highs.slice(-20)).toFixed(2) : "N/A";
    const recentLow  = lows.slice(-20).length  ? Math.min(...lows.slice(-20)).toFixed(2)  : "N/A";
    const momentum5d = closes.length >= 5
      ? ((closes[closes.length - 1] - closes[closes.length - 5]) / closes[closes.length - 5] * 100).toFixed(1)
      : "N/A";
    const momentum20d = closes.length >= 20
      ? ((closes[closes.length - 1] - closes[closes.length - 20]) / closes[closes.length - 20] * 100).toFixed(1)
      : "N/A";

    const price = q.regularMarketPrice ?? 0;
    const prevClose = q.regularMarketPreviousClose ?? price;
    const vol = q.regularMarketVolume ?? 0;
    const avgVol = q.averageDailyVolume3Month ?? 1;
    const volRatio = (vol / avgVol).toFixed(2);

    const prompt = `You are a professional swing trader and technical analyst. Analyze ${q.longName ?? upper} (${upper}) for a short-term swing trade (days to 3 weeks).

Price: $${price.toFixed(2)} | Prev Close: $${prevClose.toFixed(2)} | Today: ${q.regularMarketChangePercent?.toFixed(2) ?? 0}%
Volume: ${(vol / 1000).toFixed(0)}K (${volRatio}× avg — ${Number(volRatio) > 1.5 ? "ELEVATED" : "normal"})
20D SMA: $${sma20} | 50D SMA: $${sma50}
5D Momentum: ${momentum5d}% | 20D Momentum: ${momentum20d}%
20D High: $${recentHigh} | 20D Low: $${recentLow}
52W High: $${q.fiftyTwoWeekHigh?.toFixed(2) ?? "N/A"} | 52W Low: $${q.fiftyTwoWeekLow?.toFixed(2) ?? "N/A"}

Respond ONLY with valid JSON (no markdown):
{
  "setup": "2 sentence description of current technical setup and pattern",
  "trend": "uptrend"|"downtrend"|"sideways",
  "momentum": "strong_bullish"|"bullish"|"neutral"|"bearish"|"strong_bearish",
  "keySupport": number,
  "keyResistance": number,
  "entryZone": "price range or condition to enter",
  "targetPrice": number,
  "stopLoss": number,
  "timeframe": "expected holding period (e.g. 3-7 days)",
  "riskReward": "ratio like 1:2.5",
  "keyWatchLevels": ["level 1 to watch", "level 2 to watch"],
  "tradingNotes": "2-3 sentences on volume, momentum, pattern quality, and what confirms or invalidates the setup"
}`;

    const completion = await openai.chat.completions.create({
      model: AI_MODEL, max_completion_tokens: 800,
      response_format: { type: "json_object" },
      messages: [{ role: "user", content: prompt }],
    });
    const raw = completion.choices[0]?.message?.content ?? "{}";
    let parsed: Record<string, unknown>;
    try { parsed = JSON.parse(raw); }
    catch { const m = raw.match(/\{[\s\S]*\}/); parsed = m ? JSON.parse(m[0]) : {}; }

    const data = {
      symbol: upper,
      setup: parsed.setup ?? "Setup unavailable.",
      trend: parsed.trend ?? "sideways",
      momentum: parsed.momentum ?? "neutral",
      keySupport: parsed.keySupport ?? null,
      keyResistance: parsed.keyResistance ?? null,
      entryZone: parsed.entryZone ?? "",
      targetPrice: parsed.targetPrice ?? null,
      stopLoss: parsed.stopLoss ?? null,
      timeframe: parsed.timeframe ?? "",
      riskReward: parsed.riskReward ?? "",
      keyWatchLevels: parsed.keyWatchLevels ?? [],
      tradingNotes: parsed.tradingNotes ?? "",
      generatedAt: new Date().toISOString(),
    };
    cache.set(cacheKey, data, TTL.ANALYSIS);
    return res.json(data);
  } catch (err) {
    req.log.error({ err }, "Swing analysis failed");
    return res.status(500).json({ error: "Analysis failed" });
  }
});

export default router;
