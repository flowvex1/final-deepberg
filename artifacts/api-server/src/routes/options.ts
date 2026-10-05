import { Router } from "express";
import { openai, AI_MODEL, AI_ENABLED } from "@workspace/integrations-openai-ai-server";
import { yf } from "../lib/yahoo";
import { cache } from "../lib/cache";
import { db, optionsHistory } from "@workspace/db";
import { eq, desc, gte, and } from "drizzle-orm";
import { validateSymbolParam } from "../lib/validation";

const router = Router();
router.param("symbol", validateSymbolParam);

interface OptionContract {
  contractSymbol: string;
  type: "call" | "put";
  strike: number;
  expiration: string;
  lastPrice: number;
  bid: number;
  ask: number;
  volume: number;
  openInterest: number;
  impliedVolatility: number;
  inTheMoney: boolean;
  change: number;
  changePercent: number;
  estimatedPremium: number;
  unusualScore: number;
}

function mapContract(raw: any, type: "call" | "put"): OptionContract {
  const volume = raw.volume ?? 0;
  const openInterest = raw.openInterest ?? 0;
  const bid = raw.bid ?? 0;
  const ask = raw.ask ?? 0;
  const mid = (bid + ask) / 2;
  const estimatedPremium = volume * mid * 100;
  const unusualScore = openInterest > 0 ? volume / openInterest : volume > 0 ? 99 : 0;

  return {
    contractSymbol: raw.contractSymbol ?? "",
    type,
    strike: raw.strike ?? 0,
    expiration: raw.expiration instanceof Date
      ? raw.expiration.toISOString().split("T")[0]
      : String(raw.expiration ?? ""),
    lastPrice: raw.lastPrice ?? 0,
    bid,
    ask,
    volume,
    openInterest,
    impliedVolatility: raw.impliedVolatility ?? 0,
    inTheMoney: raw.inTheMoney ?? false,
    change: raw.change ?? 0,
    changePercent: raw.percentChange ?? 0,
    estimatedPremium,
    unusualScore,
  };
}

// ── Risk scorer — independent axis from opportunity ──────────────────────────
function riskScorePick(c: OptionContract, currentPrice: number): number {
  let risk = 10;
  const iv   = c.impliedVolatility;
  const dist = Math.abs(c.strike - currentPrice) / currentPrice;
  const spread = c.ask > 0 ? (c.ask - c.bid) / c.ask : 1;

  // IV risk: high IV collapses fast after move
  if (iv > 1.2)      risk += 35;
  else if (iv > 0.8) risk += 22;
  else if (iv > 0.5) risk += 10;
  else if (iv < 0.2) risk -= 5; // low IV = cheap insurance

  // Distance OTM risk: far strikes expire worthless often
  if (dist > 0.15)       risk += 30;
  else if (dist > 0.10)  risk += 18;
  else if (dist > 0.05)  risk += 8;

  // Spread/liquidity risk
  if (spread > 0.40)      risk += 20;
  else if (spread > 0.25) risk += 10;
  else if (spread > 0.15) risk += 5;

  // Volume risk
  if (c.volume < 20)      risk += 15;
  else if (c.volume < 50) risk += 8;

  // OI liquidity risk
  if (c.openInterest < 100) risk += 10;
  else if (c.openInterest < 500) risk += 4;

  // DTE risk
  try {
    const exp = new Date(c.expiration);
    const dte = Math.max(0, Math.round((exp.getTime() - Date.now()) / 86_400_000));
    if (dte <= 3)       risk += 35;
    else if (dte <= 7)  risk += 22;
    else if (dte <= 14) risk += 12;
    else if (dte >= 60) risk -= 8; // longer runway = lower urgency risk
  } catch { /* ignore */ }

  return Math.min(100, Math.max(0, Math.round(risk)));
}

// ── Scoring helper (shared by top-picks + can be used elsewhere) ────────────
function scorePick(
  c: OptionContract,
  currentPrice: number,
  type: "call" | "put"
): { score: number; tags: string[] } {
  let score = 0;
  const tags: string[] = [];
  const dist = Math.abs(c.strike - currentPrice) / currentPrice;
  const iv = c.impliedVolatility;
  const spread = c.ask > 0 ? (c.ask - c.bid) / c.ask : 1;
  const costPerContract = c.ask * 100;
  const isOTM = type === "call" ? c.strike > currentPrice : c.strike < currentPrice;

  if (dist <= 0.02)       { score += 3; tags.push("Near ATM"); }
  else if (dist <= 0.05)  { score += 2; tags.push("Near ATM"); }
  else if (dist <= 0.10)  { score += 1; }
  else if (dist > 0.15)   { score -= 1; }

  if (c.unusualScore >= 5)        { score += 3; tags.push("High Flow"); }
  else if (c.unusualScore >= 3)   { score += 2; tags.push("High Flow"); }
  else if (c.unusualScore >= 1.5) { score += 1; }

  if (iv < 0.30)  { score += 2; tags.push("Low IV"); }
  else if (iv < 0.60) { score += 1; }
  else if (iv > 1.0)  { score -= 1; tags.push("High IV"); }

  if (spread < 0.05)       { score += 2; tags.push("Tight Spread"); }
  else if (spread < 0.15)  { score += 1; }
  else if (spread > 0.40)  { score -= 1; }

  if (c.volume >= 1000)      { score += 2; tags.push("Heavy Volume"); }
  else if (c.volume >= 200)  { score += 1; }
  else if (c.volume < 50)    { score -= 1; }

  if (costPerContract > 0 && costPerContract <= 300) { score += 2; tags.push("Cheap Entry"); }
  else if (costPerContract <= 700)                   { score += 1; }

  if (isOTM) { score += 1; }

  return { score: Math.max(0, score), tags };
}

const TOP_PICKS_TICKERS = ["NVDA", "TSLA", "AAPL", "SPY", "AMD", "META", "QQQ", "MSFT"];
const TOP_PICKS_MAX_SCORE = 15;

router.get("/options/top-picks", async (req, res) => {
  const cacheKey = "options:top-picks";
  const cached = cache.get(cacheKey);
  if (cached) { res.json(cached); return; }

  try {
    const fetches = TOP_PICKS_TICKERS.map(async (symbol) => {
      try {
        const quote = await yf.quote(symbol);
        if (!quote?.regularMarketPrice) return null;
        const currentPrice = quote.regularMarketPrice;
        const expirations = await yf.options(symbol);
        const rawDates: Date[] = (expirations as any).expirationDates ?? [];
        if (!rawDates.length) return null;
        const chain = await yf.options(symbol, { date: rawDates[0] });
        const firstChain = ((chain as any).options ?? [])[0] ?? {};
        return {
          symbol,
          currentPrice,
          calls: (firstChain.calls ?? []).map((c: any) => mapContract(c, "call")),
          puts:  (firstChain.puts  ?? []).map((p: any) => mapContract(p, "put")),
        };
      } catch { return null; }
    });

    const results = await Promise.allSettled(fetches);
    const topCalls: any[] = [];
    const topPuts:  any[] = [];

    for (const r of results) {
      if (r.status !== "fulfilled" || !r.value) continue;
      const { symbol, currentPrice, calls, puts } = r.value;

      for (const c of calls) {
        if (c.ask <= 0 || c.volume < 10) continue;
        const { score, tags } = scorePick(c, currentPrice, "call");
        topCalls.push({
          symbol, type: "call", strike: c.strike, expiration: c.expiration,
          score, scorePercent: Math.round((score / TOP_PICKS_MAX_SCORE) * 100),
          riskScore: riskScorePick(c, currentPrice), tags,
          bid: c.bid, ask: c.ask, costPerContract: Math.round(c.ask * 100),
          volume: c.volume, openInterest: c.openInterest,
          impliedVolatility: c.impliedVolatility, inTheMoney: c.inTheMoney,
          unusualScore: c.unusualScore, currentPrice,
          distancePct: parseFloat(((c.strike - currentPrice) / currentPrice * 100).toFixed(1)),
        });
      }

      for (const p of puts) {
        if (p.ask <= 0 || p.volume < 10) continue;
        const { score, tags } = scorePick(p, currentPrice, "put");
        topPuts.push({
          symbol, type: "put", strike: p.strike, expiration: p.expiration,
          score, scorePercent: Math.round((score / TOP_PICKS_MAX_SCORE) * 100),
          riskScore: riskScorePick(p, currentPrice), tags,
          bid: p.bid, ask: p.ask, costPerContract: Math.round(p.ask * 100),
          volume: p.volume, openInterest: p.openInterest,
          impliedVolatility: p.impliedVolatility, inTheMoney: p.inTheMoney,
          unusualScore: p.unusualScore, currentPrice,
          distancePct: parseFloat(((p.strike - currentPrice) / currentPrice * 100).toFixed(1)),
        });
      }
    }

    topCalls.sort((a, b) => b.score - a.score);
    topPuts.sort((a, b) => b.score - a.score);

    const result = {
      calls: topCalls.slice(0, 8),
      puts:  topPuts.slice(0, 8),
      tickers: TOP_PICKS_TICKERS,
      generatedAt: new Date().toISOString(),
    };

    cache.set(cacheKey, result, 10 * 60);
    res.json(result);
  } catch (err) {
    req.log.error(err, "Failed to fetch top picks");
    res.status(500).json({ error: "Failed to fetch top picks" });
  }
});

router.get("/options/:symbol", async (req, res) => {
  const symbol = req.params.symbol.toUpperCase();
  const expirationParam = req.query.expiration as string | undefined;

  const cacheKey = `options:${symbol}:${expirationParam ?? "nearest"}`;
  const cached = cache.get(cacheKey);
  if (cached) {
    res.json(cached);
    return;
  }

  try {
    const quote = await yf.quote(symbol);
    if (!quote || !quote.regularMarketPrice) {
      res.status(404).json({ error: "Symbol not found" });
      return;
    }

    const currentPrice = quote.regularMarketPrice;

    const expirations = await yf.options(symbol);
    const rawDates: Date[] = (expirations as any).expirationDates ?? [];
    if (!rawDates.length) {
      res.status(404).json({ error: "No options available for this symbol" });
      return;
    }

    const expirationDates = rawDates.map((d: Date) =>
      d instanceof Date ? d.toISOString().split("T")[0] : String(d)
    );

    let selectedDate: Date;
    if (expirationParam) {
      const found = rawDates.find(
        (d) => d instanceof Date && d.toISOString().split("T")[0] === expirationParam
      );
      selectedDate = found ?? rawDates[0];
    } else {
      selectedDate = rawDates[0];
    }

    const selectedExpiration = selectedDate instanceof Date
      ? selectedDate.toISOString().split("T")[0]
      : String(selectedDate);

    const chain = await yf.options(symbol, { date: selectedDate });
    const optionsArray = (chain as any).options ?? [];
    const firstChain = optionsArray[0] ?? {};

    const rawCalls: any[] = firstChain.calls ?? [];
    const rawPuts: any[] = firstChain.puts ?? [];

    const calls = rawCalls.map((c) => mapContract(c, "call"));
    const puts = rawPuts.map((p) => mapContract(p, "put"));

    const totalCallVolume = calls.reduce((sum, c) => sum + c.volume, 0);
    const totalPutVolume = puts.reduce((sum, p) => sum + p.volume, 0);
    const putCallRatio = totalCallVolume > 0 ? totalPutVolume / totalCallVolume : 0;
    const callPremium = calls.reduce((sum, c) => sum + c.estimatedPremium, 0);
    const putPremium = puts.reduce((sum, p) => sum + p.estimatedPremium, 0);

    const allContracts = [...calls, ...puts];
    const unusualActivity = allContracts
      .filter((c) => c.volume >= 50 && c.unusualScore >= 2)
      .sort((a, b) => b.estimatedPremium - a.estimatedPremium)
      .slice(0, 20);

    const sortedCalls = [...calls].sort((a, b) => b.volume - a.volume);
    const sortedPuts = [...puts].sort((a, b) => b.volume - a.volume);

    const result = {
      symbol,
      currentPrice,
      expirationDates,
      selectedExpiration,
      putCallRatio,
      totalCallVolume,
      totalPutVolume,
      callPremium,
      putPremium,
      calls: sortedCalls,
      puts: sortedPuts,
      unusualActivity,
    };

    cache.set(cacheKey, result, 120);

    // Fire-and-forget: persist today's snapshot to DB (only for nearest expiry, no expiration param)
    if (!expirationParam) {
      const today = new Date().toISOString().split("T")[0];
      db.insert(optionsHistory).values({
        symbol,
        date: today,
        putCallRatio: result.putCallRatio,
        totalCallVolume: result.totalCallVolume,
        totalPutVolume: result.totalPutVolume,
        callPremium: result.callPremium,
        putPremium: result.putPremium,
        unusualCount: result.unusualActivity.length,
        currentPrice: result.currentPrice,
      }).onConflictDoUpdate({
        target: [optionsHistory.symbol, optionsHistory.date],
        set: {
          putCallRatio: result.putCallRatio,
          totalCallVolume: result.totalCallVolume,
          totalPutVolume: result.totalPutVolume,
          callPremium: result.callPremium,
          putPremium: result.putPremium,
          unusualCount: result.unusualActivity.length,
          currentPrice: result.currentPrice,
        },
      }).catch(() => { /* ignore snapshot errors */ });
    }

    res.json(result);
  } catch (err) {
    req.log.error(err, "Failed to fetch options data");
    res.status(500).json({ error: "Failed to fetch options data" });
  }
});

router.get("/options/:symbol/history", async (req, res) => {
  const symbol = req.params.symbol.toUpperCase();
  const days = Math.min(Number(req.query.days) || 30, 90);
  const since = new Date();
  since.setDate(since.getDate() - days);
  const sinceStr = since.toISOString().split("T")[0];

  try {
    const rows = await db
      .select()
      .from(optionsHistory)
      .where(and(eq(optionsHistory.symbol, symbol), gte(optionsHistory.date, sinceStr)))
      .orderBy(optionsHistory.date);

    res.json(rows.map((r) => ({
      symbol: r.symbol,
      date: r.date,
      putCallRatio: r.putCallRatio,
      totalCallVolume: r.totalCallVolume,
      totalPutVolume: r.totalPutVolume,
      callPremium: r.callPremium,
      putPremium: r.putPremium,
      unusualCount: r.unusualCount,
      currentPrice: r.currentPrice,
    })));
  } catch (err) {
    req.log.error(err, "Failed to fetch options history");
    res.status(500).json({ error: "Failed to fetch history" });
  }
});

router.post("/options/:symbol/analyze", async (req, res) => {
  if (!AI_ENABLED) { res.status(503).json({ error: "AI analysis is not configured for this deployment" }); return; }
  const symbol = req.params.symbol.toUpperCase();
  const cacheKey = `options:ai:${symbol}`;
  const cached = cache.get(cacheKey);
  if (cached) { res.json(cached); return; }

  try {
    const flowCached = cache.get(`options:${symbol}:nearest`) as any;
    let flow = flowCached;

    if (!flow) {
      const quote = await yf.quote(symbol);
      if (!quote?.regularMarketPrice) { res.status(404).json({ error: "Symbol not found" }); return; }
      const expirations = await yf.options(symbol);
      const rawDates: Date[] = (expirations as any).expirationDates ?? [];
      if (!rawDates.length) { res.status(404).json({ error: "No options" }); return; }
      const chain = await yf.options(symbol, { date: rawDates[0] });
      const firstChain = ((chain as any).options ?? [])[0] ?? {};
      const calls = (firstChain.calls ?? []).map((c: any) => mapContract(c, "call"));
      const puts = (firstChain.puts ?? []).map((p: any) => mapContract(p, "put"));
      const totalCallVol = calls.reduce((s: number, c: any) => s + c.volume, 0);
      const totalPutVol = puts.reduce((s: number, p: any) => s + p.volume, 0);
      const allContracts = [...calls, ...puts];
      const unusualActivity = allContracts
        .filter((c: any) => c.volume >= 50 && c.unusualScore >= 2)
        .sort((a: any, b: any) => b.estimatedPremium - a.estimatedPremium)
        .slice(0, 20);
      flow = {
        symbol, currentPrice: quote.regularMarketPrice,
        putCallRatio: totalCallVol > 0 ? totalPutVol / totalCallVol : 0,
        totalCallVolume: totalCallVol, totalPutVolume: totalPutVol,
        callPremium: calls.reduce((s: number, c: any) => s + c.estimatedPremium, 0),
        putPremium: puts.reduce((s: number, p: any) => s + p.estimatedPremium, 0),
        unusualActivity,
      };
    }

    const fmtPrem = (n: number) => n >= 1e6 ? `$${(n/1e6).toFixed(1)}M` : `$${(n/1e3).toFixed(0)}K`;
    const fmtVol = (n: number) => n >= 1e3 ? `${(n/1e3).toFixed(0)}K` : String(n);
    const sentiment = flow.putCallRatio > 1.5 ? "BEARISH" : flow.putCallRatio < 0.7 ? "BULLISH" : "NEUTRAL";

    const flowLines = (flow.unusualActivity ?? []).slice(0, 10).map((c: any) =>
      `- ${c.type.toUpperCase()} $${c.strike} exp ${c.expiration}: Vol ${fmtVol(c.volume)} / OI ${fmtVol(c.openInterest)} (${c.unusualScore > 90 ? "∞" : c.unusualScore.toFixed(1)}x unusual), IV ${(c.impliedVolatility * 100).toFixed(1)}%, Est. Premium ${fmtPrem(c.estimatedPremium)}${c.inTheMoney ? " [ITM]" : ""}`
    ).join("\n");

    const prompt = `You are an expert options flow analyst. Analyze this real-time options flow for ${symbol}.

Price: $${flow.currentPrice.toFixed(2)}
Put/Call Volume Ratio: ${flow.putCallRatio.toFixed(2)} (${sentiment} bias)
Call Volume: ${fmtVol(flow.totalCallVolume)} — Premium: ${fmtPrem(flow.callPremium)}
Put Volume: ${fmtVol(flow.totalPutVolume)} — Premium: ${fmtPrem(flow.putPremium)}

Top Unusual Activity (sorted by premium):
${flowLines || "None detected"}

Analyze:
1. Dominant sentiment from the flow (bullish/bearish/neutral)
2. Which unusual activity stands out most and why
3. What this flow suggests about near-term momentum and potential price direction
4. Signs of institutional or block trade positioning
5. One actionable insight for traders watching this name

Respond ONLY with valid JSON (no markdown):
{
  "unusualSummary": "2-3 sentences on the most unusual/noteworthy activity",
  "sentiment": "bullish"|"bearish"|"neutral",
  "momentumSignal": "1-2 sentences on what flow implies about near-term price direction",
  "keyBlocks": ["key observation 1", "key observation 2", "key observation 3"],
  "recommendation": "1-2 sentences of the key actionable insight"
}`;

    const completion = await openai.chat.completions.create({
      model: AI_MODEL,
      response_format: { type: "json_object" },
      max_completion_tokens: 800,
      messages: [{ role: "user", content: prompt }],
    });

    const raw = completion.choices[0]?.message?.content ?? "{}";
    let parsed: Record<string, unknown>;
    try { parsed = JSON.parse(raw); }
    catch { const m = raw.match(/\{[\s\S]*\}/); parsed = m ? JSON.parse(m[0]) : {}; }

    const result = {
      symbol,
      unusualSummary: parsed.unusualSummary ?? "Analysis unavailable.",
      sentiment: parsed.sentiment ?? "neutral",
      momentumSignal: parsed.momentumSignal ?? "",
      keyBlocks: parsed.keyBlocks ?? [],
      recommendation: parsed.recommendation ?? "",
      generatedAt: new Date().toISOString(),
    };

    cache.set(cacheKey, result, 600);
    res.json(result);
  } catch (err) {
    req.log.error(err, "Options flow analysis failed");
    res.status(500).json({ error: "Analysis failed" });
  }
});

// ── Smart Strike Recommender ──────────────────────────────────────────────────
router.post("/options/:symbol/smart-strike", async (req, res) => {
  if (!AI_ENABLED) { res.status(503).json({ error: "AI analysis is not configured for this deployment" }); return; }
  const { symbol } = req.params;
  const upper = symbol.toUpperCase();
  const { outlook = "bullish", timeframe = "1month", riskTolerance = "moderate", strategy = "buy_call" } = req.body ?? {};

  try {
    const quote = await yf.quote(upper);
    const currentPrice: number = (quote as any).regularMarketPrice ?? 0;
    if (!currentPrice) {
      res.status(404).json({ error: "Symbol not found" });
      return;
    }

    // Fetch expiration dates
    const expirations = await yf.options(upper);
    const rawDates: Date[] = ((expirations as any).expirationDates ?? []).slice(0, 6);
    if (!rawDates.length) {
      res.status(404).json({ error: "No options available for this symbol" });
      return;
    }

    // Pick expiry dates based on timeframe preference
    const now = Date.now();
    const msDay = 86400000;
    const targets: Record<string, number> = {
      "1week": 7, "2weeks": 14, "1month": 30, "3months": 90,
    };
    const targetDays = targets[timeframe] ?? 30;

    // Find closest date to target, plus one shorter and one longer
    const scored = rawDates
      .map((d) => ({ d, diff: Math.abs((d.getTime() - now) / msDay - targetDays) }))
      .sort((a, b) => a.diff - b.diff);

    const selectedDates = scored.slice(0, 3).map((x) => x.d);

    // Fetch chains for each expiry
    const chains = await Promise.allSettled(
      selectedDates.map((d) => yf.options(upper, { date: d }))
    );

    interface ChainSummary {
      expiration: string;
      daysToExpiry: number;
      calls: OptionContract[];
      puts: OptionContract[];
    }

    const chainSummaries: ChainSummary[] = [];
    for (let i = 0; i < chains.length; i++) {
      const result = chains[i];
      if (result.status !== "fulfilled") continue;
      const optArr = (result.value as any).options ?? [];
      const first = optArr[0] ?? {};
      const expDate = selectedDates[i];
      const expStr = expDate.toISOString().split("T")[0];
      const dte = Math.round((expDate.getTime() - now) / msDay);

      const calls = (first.calls ?? []).map((c: any) => mapContract(c, "call"))
        .filter((c: OptionContract) => c.volume > 0 || c.openInterest > 0);
      const puts = (first.puts ?? []).map((p: any) => mapContract(p, "put"))
        .filter((p: OptionContract) => p.volume > 0 || p.openInterest > 0);

      chainSummaries.push({ expiration: expStr, daysToExpiry: dte, calls, puts });
    }

    // Build a compact chain snapshot for the prompt
    const formatContracts = (contracts: OptionContract[], price: number, maxRows = 8) => {
      const sorted = [...contracts].sort((a, b) =>
        Math.abs(a.strike - price) - Math.abs(b.strike - price)
      ).slice(0, maxRows);
      return sorted.map((c) => {
        const mid = (c.bid + c.ask) / 2;
        const moneyness = ((c.strike - price) / price * 100).toFixed(1);
        const sign = c.strike >= price ? "+" : "";
        return `  Strike $${c.strike} (${sign}${moneyness}%): bid ${c.bid.toFixed(2)} / ask ${c.ask.toFixed(2)} / IV ${(c.impliedVolatility * 100).toFixed(0)}% / Vol ${c.volume} / OI ${c.openInterest}${c.inTheMoney ? " [ITM]" : ""}`;
      }).join("\n");
    };

    const chainText = chainSummaries.map((ch) => {
      const relevant = strategy.includes("put") ? ch.puts : ch.calls;
      const other = strategy.includes("put") ? ch.calls : ch.puts;
      const label = strategy.includes("put") ? "PUTS" : "CALLS";
      return `Expiry ${ch.expiration} (${ch.daysToExpiry} DTE):\n${label}:\n${formatContracts(relevant, currentPrice)}\n${strategy === "spread" ? `${strategy.includes("put") ? "CALLS" : "PUTS"}:\n${formatContracts(other, currentPrice)}` : ""}`;
    }).join("\n\n");

    const strategyDescriptions: Record<string, string> = {
      buy_call: "long call (bullish directional)",
      buy_put: "long put (bearish directional)",
      sell_put: "cash-secured put (neutral-to-bullish income)",
      sell_call: "covered call (income on existing shares)",
      spread: "vertical spread (defined risk)",
    };
    const strategyDesc = strategyDescriptions[strategy] ?? strategy;

    const prompt = `You are an expert options strategist. A trader wants a Smart Strike Recommendation for ${upper}.

INPUTS:
- Current Price: $${currentPrice.toFixed(2)}
- Outlook: ${outlook.toUpperCase()}
- Timeframe: ${timeframe} (${targetDays} days target)
- Risk Tolerance: ${riskTolerance}
- Strategy: ${strategyDesc}

LIVE OPTIONS CHAIN DATA:
${chainText}

TASK: Recommend exactly 3 specific option contracts that best match the trader's inputs. For each:
1. Pick a real strike from the chain data above (must be an actual strike listed)
2. Pick one of the expiration dates shown
3. Justify why this strike+expiry is optimal given their outlook, timeframe, and risk tolerance
4. Calculate the breakeven price (for calls: strike + premium; for puts: strike - premium)
5. Estimate probability of profit (rough % based on moneyness + IV)
6. Rate risk: low / medium / high

Respond ONLY with valid JSON (no markdown, no extra text):
{
  "symbol": "${upper}",
  "currentPrice": ${currentPrice.toFixed(2)},
  "strategy": "${strategy}",
  "outlook": "${outlook}",
  "recommendations": [
    {
      "rank": 1,
      "label": "Best Match",
      "strike": 123,
      "expiration": "YYYY-MM-DD",
      "type": "call"|"put",
      "bid": 1.23,
      "ask": 1.45,
      "mid": 1.34,
      "iv": 0.35,
      "breakeven": 124.34,
      "probabilityOfProfit": 42,
      "risk": "medium",
      "rationale": "2-3 sentences explaining why this strike+expiry is ideal for the stated outlook and timeframe",
      "keyRisk": "1 sentence on the main risk to this trade"
    },
    { "rank": 2, "label": "Conservative Pick", ... },
    { "rank": 3, "label": "Aggressive Pick", ... }
  ],
  "marketContext": "1-2 sentences on current IV environment and how it affects this strategy",
  "generalAdvice": "1 sentence of overall guidance for this setup"
}`;

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

    res.json({ ...parsed, generatedAt: new Date().toISOString() });
  } catch (err) {
    req.log.error(err, "Smart strike recommendation failed");
    res.status(500).json({ error: "Recommendation failed" });
  }
});

// ── Budget Screener ─────────────────────────────────────────────────────────
const BUDGET_SCREENER_DEFAULT_TICKERS = [
  "NVDA", "TSLA", "AAPL", "SPY", "AMD", "META", "QQQ", "MSFT",
  "AMZN", "GOOGL", "PLTR", "COIN", "SOFI", "MSTR", "HOOD", "UBER",
];

router.post("/options/budget-screener", async (req, res) => {
  const budget = Number(req.body?.budget ?? 0);
  if (!budget || budget < 10) {
    res.status(400).json({ error: "budget must be a positive number (min $10)" });
    return;
  }

  const rawTickers: unknown = req.body?.tickers;
  const tickers: string[] = (
    Array.isArray(rawTickers) && rawTickers.length
      ? rawTickers.slice(0, 20)
      : BUDGET_SCREENER_DEFAULT_TICKERS
  ).map((t: unknown) => String(t).toUpperCase().trim()).filter(Boolean);

  const MAX_EXPIRIES = 3; // scan up to 3 near-term expirations per ticker

  const fetches = tickers.map(async (symbol) => {
    try {
      const quote = await yf.quote(symbol);
      if (!quote?.regularMarketPrice) return [];
      const currentPrice = quote.regularMarketPrice;

      const expirations = await yf.options(symbol);
      const rawDates: Date[] = (expirations as any).expirationDates ?? [];
      if (!rawDates.length) return [];

      // Only look at near-term expiries (next MAX_EXPIRIES dates after today)
      const now = Date.now();
      const upcomingDates = rawDates
        .filter((d) => new Date(d).getTime() > now)
        .slice(0, MAX_EXPIRIES);

      const contractBatch: any[] = [];
      for (const date of upcomingDates) {
        try {
          const chain = await yf.options(symbol, { date });
          const firstChain = ((chain as any).options ?? [])[0] ?? {};
          const calls: OptionContract[] = (firstChain.calls ?? []).map((c: any) => mapContract(c, "call"));

          for (const c of calls) {
            const cost = c.ask * 100;
            if (c.ask <= 0 || cost > budget || c.volume < 5) continue;

            const { score, tags } = scorePick(c, currentPrice, "call");
            const risk = riskScorePick(c, currentPrice);

            // Budget-specific bonuses
            let budgetScore = score;
            const contractsAffordable = Math.floor(budget / cost);
            if (contractsAffordable >= 5) budgetScore += 1; // can size up
            if (cost / budget <= 0.25) budgetScore += 1;    // uses ≤25% of budget per contract

            // DTE bonus: ideal swing range 14-60 days
            const exp = new Date(c.expiration);
            const dte = Math.max(0, Math.round((exp.getTime() - now) / 86_400_000));
            const dteBonus = dte >= 14 && dte <= 60 ? 1 : 0;
            budgetScore += dteBonus;

            contractBatch.push({
              symbol,
              currentPrice,
              type: "call",
              strike: c.strike,
              expiration: c.expiration,
              dte,
              bid: c.bid,
              ask: c.ask,
              mid: parseFloat(((c.bid + c.ask) / 2).toFixed(2)),
              costPerContract: Math.round(cost),
              contractsAffordable,
              volume: c.volume,
              openInterest: c.openInterest,
              impliedVolatility: parseFloat((c.impliedVolatility * 100).toFixed(1)),
              inTheMoney: c.inTheMoney,
              unusualScore: c.unusualScore,
              score: budgetScore,
              riskScore: risk,
              tags,
              distancePct: parseFloat(((c.strike - currentPrice) / currentPrice * 100).toFixed(1)),
              breakeven: parseFloat((c.strike + c.ask).toFixed(2)),
              breakevenPct: parseFloat(((c.strike + c.ask - currentPrice) / currentPrice * 100).toFixed(1)),
            });
          }
        } catch { /* skip this expiry */ }
      }
      return contractBatch;
    } catch { return []; }
  });

  try {
    const batches = await Promise.allSettled(fetches);
    const all: any[] = [];
    for (const b of batches) {
      if (b.status === "fulfilled") all.push(...b.value);
    }

    const MAX_SCORE = 17;
    const top = all
      .sort((a, b) => b.score - a.score)
      .slice(0, 25)
      .map((c, i) => ({
        ...c,
        rank: i + 1,
        scorePercent: Math.min(100, Math.round((c.score / MAX_SCORE) * 100)),
      }));

    res.json({ budget, tickers, results: top, scannedAt: new Date().toISOString() });
  } catch (err) {
    req.log.error(err, "Budget screener failed");
    res.status(500).json({ error: "Screener failed" });
  }
});

export default router;
