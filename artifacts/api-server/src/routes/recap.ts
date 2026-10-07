import { Router } from "express";
import { openai, AI_MODEL, AI_ENABLED } from "@workspace/integrations-openai-ai-server";
import { cache } from "../lib/cache";
import { yf } from "../lib/yahoo";

const router = Router();

router.post("/recap/daily", async (req, res) => {
  if (!AI_ENABLED) { res.status(503).json({ error: "AI analysis is not configured for this deployment" }); return; }
  const today = new Date().toISOString().slice(0, 10);
  const cacheKey = `recap:daily:${today}`;
  const cached = cache.get<unknown>(cacheKey);
  if (cached) return res.json(cached);

  try {
    const [gainersR, losersR, activeR, newsR] = await Promise.allSettled([
      yf.screener("day_gainers",   { count: 8 }),
      yf.screener("day_losers",    { count: 8 }),
      yf.screener("most_actives",  { count: 8 }),
      yf.search("market",          { newsCount: 10, quotesCount: 0 }),
    ]);

    type ScreenerResult = Awaited<ReturnType<typeof yf.screener>>;
    const mapScreener = (r: PromiseSettledResult<ScreenerResult>) => {
      if (r.status === "rejected") return [];
      return (r.value.quotes ?? []).slice(0, 8).map((q) => ({
        symbol:        q.symbol ?? "",
        name:          q.longName ?? q.shortName ?? q.symbol ?? "",
        price:         q.regularMarketPrice ?? 0,
        changePercent: q.regularMarketChangePercent ?? 0,
        volume:        q.regularMarketVolume ?? 0,
      }));
    };

    const gainers   = mapScreener(gainersR);
    const losers    = mapScreener(losersR);
    const actives   = mapScreener(activeR);
    const headlines = newsR.status === "fulfilled"
      ? (newsR.value.news ?? []).slice(0, 10).map(n => `- ${n.title}`).join("\n")
      : "";

    const fmtList = (arr: typeof gainers) =>
      arr.slice(0, 6).map(s =>
        `${s.symbol} (${s.changePercent >= 0 ? "+" : ""}${s.changePercent.toFixed(2)}%)`
      ).join(", ");

    const prompt = `You are a Wall Street trading desk analyst writing a concise end-of-day recap for retail traders. Today is ${today}.

MARKET DATA:
Top Gainers: ${fmtList(gainers)}
Top Losers: ${fmtList(losers)}
Most Active: ${fmtList(actives)}

Today's Headlines:
${headlines || "No headlines available."}

Write a sharp, direct daily recap. Keep every field punchy and plain-English — no jargon. Imagine you're texting a smart friend who trades but isn't a professional.

Respond ONLY with valid JSON (no markdown):
{
  "marketSummary": "2-3 sentences capturing the overall market mood today — was it risk-on, risk-off, mixed? What was the dominant theme?",
  "bestTrades": [
    { "symbol": "TICKER", "move": "+X.X%", "why": "1 sentence plain-English reason this stock popped today" }
  ],
  "worstSignals": [
    { "symbol": "TICKER", "move": "-X.X%", "why": "1 sentence on why this one failed or got hit today" }
  ],
  "missedOpportunities": [
    { "symbol": "TICKER", "move": "±X.X%", "setup": "1 sentence describing what the setup looked like before the move — what traders who caught it saw" }
  ],
  "keyTakeaway": "1 punchy sentence — the single most important thing a trader should remember from today",
  "sentiment": "bullish" | "bearish" | "mixed",
  "sessionGrade": "A" | "B" | "C" | "D"
}

Rules:
- bestTrades: pick 3-4 standout winners from the gainers list
- worstSignals: pick 2-3 notable losers or broken setups
- missedOpportunities: 2-3 stocks that moved big but weren't obvious beforehand
- Be honest — if today was a boring session say so
- sessionGrade is an overall letter grade for how interesting/tradeable today was`;

    const completion = await openai.chat.completions.create({
      model: AI_MODEL,
      response_format: { type: "json_object" },
      max_completion_tokens: 1200,
      messages: [{ role: "user", content: prompt }],
    });

    const raw = completion.choices[0]?.message?.content ?? "{}";
    let parsed: Record<string, unknown>;
    try { parsed = JSON.parse(raw); }
    catch { const m = raw.match(/\{[\s\S]*\}/); parsed = m ? JSON.parse(m[0]) : {}; }

    const data = {
      date:                 today,
      marketSummary:        parsed.marketSummary        ?? "Market data unavailable.",
      bestTrades:           parsed.bestTrades           ?? [],
      worstSignals:         parsed.worstSignals         ?? [],
      missedOpportunities:  parsed.missedOpportunities  ?? [],
      keyTakeaway:          parsed.keyTakeaway          ?? "",
      sentiment:            parsed.sentiment            ?? "mixed",
      sessionGrade:         parsed.sessionGrade         ?? "C",
      topGainers:           gainers.slice(0, 5),
      topLosers:            losers.slice(0, 5),
      generatedAt:          new Date().toISOString(),
    };

    cache.set(cacheKey, data, 30 * 60_000);
    return res.json(data);
  } catch (err) {
    req.log.error({ err }, "Daily recap failed");
    return res.status(500).json({ error: "Failed to generate recap" });
  }
});

export default router;
