import { Router } from "express";
import { openai, AI_MODEL, AI_ENABLED } from "@workspace/integrations-openai-ai-server";
import { cache } from "../lib/cache";
import { yf } from "../lib/yahoo";
import { boundedText } from "../lib/validation";

const router = Router();

/* ── Ticker extractor ─────────────────────────────────────────────────── */
const NOISE = new Set([
  "I","A","TO","IN","OR","AND","NOT","FOR","THE","IS","IT","ON","AT","BE",
  "DO","MY","ME","AN","IF","US","UP","GO","VS","ITS","BUT","ARE","WAS","GET",
  "NOW","CAN","HAS","HAD","HIM","HER","SHE","HE","WE","YOU","THIS","THAT","WILL",
  "WHAT","WHEN","HOW","WHY","WHO","FROM","INTO","ABOUT","WOULD","SHOULD","COULD",
  "WITH","THEY","THEIR","HAVE","BEEN","SELL","BUY","HOLD","LONG","WAIT","ENTER",
]);

function extractTicker(q: string): string | null {
  const matches = q.match(/\b[A-Z]{1,5}\b/g) ?? [];
  return matches.find(m => !NOISE.has(m)) ?? null;
}

function sma(prices: number[], period: number): number | null {
  if (prices.length < period) return null;
  const slice = prices.slice(-period);
  return slice.reduce((a, b) => a + b, 0) / period;
}

router.post("/ask-deepberg", async (req, res) => {
  if (!AI_ENABLED) {
    res.status(503).json({ error: "AI analysis is not configured for this deployment" });
    return;
  }
  const question = boundedText(req.body?.question, 1_000);
  if (!question) { res.status(400).json({ error: "Question is required and must be under 1,000 characters" }); return; }

  /* Extract ticker from question */
  const upperQ   = question.toUpperCase();
  let symbol     = req.body?.symbol?.trim().toUpperCase() || extractTicker(upperQ);
  const noSymbol = !symbol;

  /* Cache key — no symbol = general market question */
  const cacheKey = `deepberg:${symbol ?? "market"}:${question.toLowerCase().slice(0, 60)}`;
  const cached = cache.get(cacheKey);
  if (cached) { res.json(cached); return; }

  try {
    let stockCtx   = "";
    let earningsCtx = "";

    if (symbol) {
      const since60 = new Date(Date.now() - 60 * 86_400_000);

      const [qR, chartR, newsR] = await Promise.allSettled([
        yf.quote(symbol),
        yf.chart(symbol, { period1: since60, interval: "1d" }),
        yf.search(symbol, { newsCount: 5, quotesCount: 0 }),
      ]);

      if (qR.status === "rejected" || !(qR.value as any)?.regularMarketPrice) {
        /* Bad ticker — try treating as a general question */
        symbol = null;
      } else {
        const q       = qR.value as any;
        const history = chartR.status === "fulfilled"
          ? (chartR.value.quotes ?? []).filter((h: any) => h.close != null)
          : [];
        const closes  = history.map((h: any) => h.close as number);
        const volumes = history.map((h: any) => h.volume as number).filter(Boolean);
        const headlines = newsR.status === "fulfilled"
          ? (newsR.value as any).news?.slice(0, 5).map((n: any) => `  - ${n.title}`).join("\n") ?? ""
          : "";

        const sma20    = sma(closes, 20);
        const sma50    = sma(closes, 50);
        const mom5d    = closes.length >= 5
          ? ((closes[closes.length - 1] - closes[closes.length - 5]) / closes[closes.length - 5] * 100).toFixed(2)
          : "N/A";
        const mom20d   = closes.length >= 20
          ? ((closes[closes.length - 1] - closes[closes.length - 20]) / closes[closes.length - 20] * 100).toFixed(2)
          : "N/A";

        const avgVol30 = volumes.length ? volumes.slice(-30).reduce((a, b) => a + b, 0) / Math.min(volumes.length, 30) : 1;
        const volRatio = q.regularMarketVolume ? (q.regularMarketVolume / avgVol30).toFixed(2) : "N/A";

        const w52Low  = q.fiftyTwoWeekLow;
        const w52High = q.fiftyTwoWeekHigh;
        const price   = q.regularMarketPrice;
        const w52Pos  = (w52Low && w52High && w52High > w52Low)
          ? ((price - w52Low) / (w52High - w52Low) * 100).toFixed(0) : "N/A";

        /* Earnings */
        const ed = q.earningsDate ?? q.earningsTimestamp;
        if (ed) {
          const d = new Date(typeof ed === "number" ? ed * 1000 : ed);
          if (!isNaN(d.getTime())) {
            const daysUntil = Math.round((d.getTime() - Date.now()) / 86_400_000);
            earningsCtx = daysUntil >= 0 && daysUntil <= 30
              ? `Earnings in ${daysUntil} days (${d.toISOString().slice(0, 10)}) — EVENT RISK`
              : `Next earnings: ${d.toISOString().slice(0, 10)}`;
          }
        }

        stockCtx = `
STOCK: ${symbol}
Company: ${q.longName ?? q.shortName ?? symbol}
Sector: ${q.sector ?? "Unknown"}
Price: $${price?.toFixed(2)} (${q.regularMarketChangePercent?.toFixed(2) ?? 0}% today)
52W Range: $${w52Low?.toFixed(2)} – $${w52High?.toFixed(2)} (at ${w52Pos}% of range)
Market Cap: ${q.marketCap ? `$${(q.marketCap / 1e9).toFixed(1)}B` : "N/A"}
Beta: ${q.beta?.toFixed(2) ?? "N/A"}
P/E (trailing): ${q.trailingPE?.toFixed(1) ?? "N/A"}
Forward P/E: ${q.forwardPE?.toFixed(1) ?? "N/A"}
Profit Margin: ${q.profitMargins != null ? `${(q.profitMargins * 100).toFixed(1)}%` : "N/A"}
Volume: ${q.regularMarketVolume?.toLocaleString() ?? "N/A"} (${volRatio}× avg)
5D Momentum: ${mom5d}% | 20D Momentum: ${mom20d}%
SMA-20: ${sma20 ? `$${sma20.toFixed(2)}` : "N/A"} | SMA-50: ${sma50 ? `$${sma50.toFixed(2)}` : "N/A"}
Price vs SMA-20: ${sma20 ? `${price > sma20 ? "ABOVE ✓" : "BELOW ✗"} by ${Math.abs(((price - sma20) / sma20) * 100).toFixed(1)}%` : "N/A"}
${earningsCtx ? `\nEARNINGS: ${earningsCtx}` : ""}
${headlines ? `\nRECENT NEWS:\n${headlines}` : ""}`.trim();
      }
    }

    /* Regime context */
    const regimeCached = cache.get("market:regime") as any;
    const regimeCtx = regimeCached
      ? `MARKET REGIME: ${regimeCached.label} (${regimeCached.quadrantLabel})
  Opportunity Score: ${regimeCached.opportunityScore}/100 | Risk Score: ${regimeCached.riskScore}/100
  VIX: ${regimeCached.signals?.vix?.toFixed(1)} (${(regimeCached.signals?.vixChange ?? 0) >= 0 ? "+" : ""}${regimeCached.signals?.vixChange?.toFixed(1)}% today)
  SPY: ${(regimeCached.signals?.spyMove ?? 0) >= 0 ? "+" : ""}${regimeCached.signals?.spyMove?.toFixed(2)}% | Regime advice: ${regimeCached.hints?.[0] ?? "N/A"}`
      : "MARKET REGIME: Data unavailable — assume neutral conditions.";

    const prompt = `You are Deepberg, a friendly and brilliant investing guide who explains the stock market in plain, everyday language that anyone can understand — even someone who has never invested before.

A user just asked: "${question}"

${stockCtx ? stockCtx + "\n\n" : ""}${regimeCtx}

Your job is to give a clear, helpful answer as if you are explaining to a smart friend who is NOT a finance professional. Follow these rules strictly:

LANGUAGE RULES (most important):
- Write like a knowledgeable friend texting someone, NOT like a Wall Street analyst
- NO jargon: replace "bullish" with "going up", "bearish" with "going down", "regime" with "market conditions", "confluence" with "multiple signs agree", "volatility" with "price swings", "SMA" with "average price over X days", etc.
- If you MUST use a technical term, immediately explain it in plain English in parentheses
- Use real-world analogies when helpful (e.g. "think of the stop loss like a seatbelt")
- Short sentences. Simple words. Friendly tone.
- The decision must be something a beginner can read and immediately understand what to do

The edgeAttribution factor names should be everyday phrases like "Is it trending up?", "Are people buying or selling?", "Are big investors active?", "Is the overall market helping?". Percentages MUST sum to exactly 100.
Contradictions: explain mixed signals in plain English — what two things are disagreeing and why it matters.
behavioralInsight: explain the mistake most beginners make in this exact situation, simply and kindly.
traderMistake: one clear sentence a beginner can act on immediately.
reasoning: Write 3 short paragraphs in plain English. Paragraph 1: what the stock is doing and why. Paragraph 2: how the overall market is affecting it. Paragraph 3: what to watch for and how to manage the risk.

Respond ONLY with valid JSON (no markdown, no code fences):
{
  "decision": "One plain-English sentence anyone can understand, with a specific price or condition",
  "recommendation": "enter_now"|"wait_confirmation"|"wait_pullback"|"avoid",
  "confidence": integer 0-100,
  "lifecycle": "setup_detected"|"confirmation_triggered"|"entry_zone_active"|"target_hit"|"setup_failed"|"monitoring",
  "edgeAttribution": [
    {"factor": "Is it trending up?", "pct": integer, "direction": "bullish"|"bearish"|"neutral", "note": "plain-English one-liner"},
    {"factor": "Are people buying or selling?", "pct": integer, "direction": "bullish"|"bearish"|"neutral", "note": "plain-English one-liner"},
    {"factor": "Are big investors active?", "pct": integer, "direction": "bullish"|"bearish"|"neutral", "note": "plain-English one-liner"},
    {"factor": "Is the overall market helping?", "pct": integer, "direction": "bullish"|"bearish"|"neutral", "note": "plain-English one-liner"}
  ],
  "contradictions": ["plain-English description of the mixed signal — max 3, can be empty array"],
  "behavioralInsight": "Plain English: what mistake do most beginners make in this exact situation right now?",
  "traderMistake": "One simple sentence a beginner can act on immediately",
  "eventRisk": [{"event": "string", "impact": "high"|"medium"|"low", "note": "plain-English explanation of why this matters"}],
  "reasoning": "3 short paragraphs in plain, friendly English — no jargon allowed",
  "entryZone": "specific price or simple condition in plain English",
  "target": "specific price or simple percentage move",
  "stopLoss": "specific price, explained simply (e.g. 'if it drops below $X, that's your exit')",
  "symbol": "${symbol ?? "MARKET"}"
}`;

    const completion = await openai.chat.completions.create({
      model: AI_MODEL,
      response_format: { type: "json_object" },
      max_completion_tokens: 1500,
      messages: [
        {
          role: "system",
          content: "You are Deepberg. Always respond with pure JSON only. Never add markdown, code fences, or extra text.",
        },
        { role: "user", content: prompt },
      ],
    });

    const raw = completion.choices[0]?.message?.content ?? "{}";
    let parsed: Record<string, unknown>;
    try {
      parsed = JSON.parse(raw);
    } catch {
      const m = raw.match(/\{[\s\S]*\}/);
      parsed = m ? JSON.parse(m[0]) : {};
    }

    const result = {
      question,
      symbol:           parsed.symbol ?? symbol ?? "MARKET",
      decision:         parsed.decision ?? "Analysis unavailable",
      recommendation:   parsed.recommendation ?? "monitoring",
      confidence:       Number(parsed.confidence) || 50,
      lifecycle:        parsed.lifecycle ?? "monitoring",
      edgeAttribution:  Array.isArray(parsed.edgeAttribution) ? parsed.edgeAttribution : [],
      contradictions:   Array.isArray(parsed.contradictions) ? parsed.contradictions : [],
      behavioralInsight: parsed.behavioralInsight ?? null,
      traderMistake:    parsed.traderMistake ?? null,
      eventRisk:        Array.isArray(parsed.eventRisk) ? parsed.eventRisk : [],
      reasoning:        parsed.reasoning ?? "",
      entryZone:        parsed.entryZone ?? null,
      target:           parsed.target ?? null,
      stopLoss:         parsed.stopLoss ?? null,
      generatedAt:      new Date().toISOString(),
    };

    /* Cache: 3 min for market questions, 2 min for stock analysis */
    cache.set(cacheKey, result, noSymbol ? 3 * 60 : 2 * 60);
    res.json(result);
  } catch (err) {
    req.log.error(err, "Ask Deepberg failed");
    res.status(500).json({ error: "Analysis failed — try again" });
  }
});

export default router;
