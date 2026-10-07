import { Router } from "express";
import { yf } from "../lib/yahoo";
import { cache } from "../lib/cache";

const router = Router();

const WATCHLIST = [
  "AAPL","MSFT","NVDA","META","AMZN","TSLA","GOOGL","AMD","NFLX","ORCL",
  "UBER","COIN","PLTR","ARM","SHOP","SNOW","CRWD","PANW","ANET","SMCI",
  "JPM","GS","BAC","XOM","LLY","BA","DIS","SOFI","MSTR","RBLX",
  "IONQ","MU","INTC","BABA","HOOD","MARA","RIOT","SPY","QQQ","IWM",
];

interface SignalResult {
  symbol:       string;
  companyName:  string;
  price:        number;
  changePercent: number;
  signalType:   string;
  direction:    "bullish" | "bearish" | "neutral";
  strength:     number;
  headline:     string;
  detail:       string;
  metrics:      Record<string, string>;
  category:     "invest" | "options";
}

function clamp(n: number, lo = 0, hi = 99) { return Math.min(hi, Math.max(lo, Math.round(n))); }

router.get("/signals", async (req, res) => {
  const cacheKey = "signals:all";
  const cached   = cache.get(cacheKey);
  if (cached) return res.json(cached);

  try {
    /* ── Fetch quotes for whole watchlist + screeners ── */
    const [quotesSettled, activesR, gainersR] = await Promise.allSettled([
      Promise.allSettled(WATCHLIST.map(sym => yf.quote(sym).then(q => ({ sym, q })))),
      yf.screener("most_actives", { count: 15 }),
      yf.screener("day_gainers",  { count: 15 }),
    ]);

    const quoteMap = new Map<string, any>();

    /* Base watchlist quotes */
    if (quotesSettled.status === "fulfilled") {
      for (const r of quotesSettled.value) {
        if (r.status === "fulfilled" && (r.value.q as any)?.regularMarketPrice) {
          quoteMap.set(r.value.sym, r.value.q);
        }
      }
    }

    /* Merge in screener results (may introduce additional symbols) */
    for (const sr of [activesR, gainersR]) {
      if (sr.status === "fulfilled") {
        const quotes: any[] = (sr.value as any)?.quotes ?? [];
        for (const q of quotes) {
          const sym = q.symbol;
          if (sym && !quoteMap.has(sym) && q.regularMarketPrice) quoteMap.set(sym, q);
        }
      }
    }

    const signals: SignalResult[] = [];

    for (const [sym, q] of quoteMap) {
      const price      = q.regularMarketPrice  as number;
      const changePct  = q.regularMarketChangePercent ?? 0;
      const volume     = q.regularMarketVolume ?? 0;
      const avgVol     = (q.averageDailyVolume3Month ?? q.averageDailyVolume10Day ?? volume) || 1;
      const volRatio   = volume / avgVol;
      const w52Low     = q.fiftyTwoWeekLow  ?? price;
      const w52High    = q.fiftyTwoWeekHigh ?? price;
      const w52Range   = w52High - w52Low || 1;
      const w52Pos     = (price - w52Low) / w52Range;           /* 0–1 position in yearly range */
      const beta       = q.beta ?? 1;
      const shortRatio = q.shortRatio ?? 0;
      const name       = q.longName ?? q.shortName ?? sym;

      /* Earnings timing */
      const ed = q.earningsDate ?? q.earningsTimestamp;
      let daysToEarnings: number | null = null;
      if (ed) {
        const ms = typeof ed === "number" ? ed * 1000 : new Date(ed).getTime();
        const d  = Math.round((ms - Date.now()) / 86_400_000);
        daysToEarnings = isNaN(d) ? null : d;
      }

      /* ════════════════════════════════════════════════════
         INVEST SIGNALS
      ════════════════════════════════════════════════════ */

      /* 1. Momentum Breakout — strong move + big volume */
      if (changePct >= 3 && volRatio >= 1.8 && w52Pos >= 0.55) {
        signals.push({
          symbol: sym, companyName: name, price, changePercent: changePct,
          signalType: "Momentum Breakout", direction: "bullish",
          strength: clamp(50 + changePct * 4 + volRatio * 5),
          headline: `${sym} is up ${changePct.toFixed(1)}% today on ${volRatio.toFixed(1)}× normal volume`,
          detail: `When a stock rises strongly AND more people are buying than usual, it often means big professional investors are moving in — not just regular retail traders. This combination is one of the most reliable buy signals.`,
          metrics: {
            "Today's move":     `+${changePct.toFixed(2)}%`,
            "Volume vs normal": `${volRatio.toFixed(1)}×`,
            "Position in year": `top ${(100 - w52Pos * 100).toFixed(0)}%`,
          },
          category: "invest",
        });
      }

      /* 2. Volume Surge — huge volume without huge price move (accumulation) */
      else if (volRatio >= 3.5 && Math.abs(changePct) < 3 && Math.abs(changePct) > 0.5) {
        signals.push({
          symbol: sym, companyName: name, price, changePercent: changePct,
          signalType: "Volume Surge", direction: changePct >= 0 ? "bullish" : "bearish",
          strength: clamp(48 + volRatio * 4),
          headline: `${sym} is trading ${volRatio.toFixed(1)}× its normal daily volume today`,
          detail: `Massive volume with a small price move is a classic sign that big institutions are quietly buying (or selling) without showing their hand. Something is happening behind the scenes — worth watching closely.`,
          metrics: {
            "Volume multiple":  `${volRatio.toFixed(1)}× avg`,
            "Price move":       `${changePct >= 0 ? "+" : ""}${changePct.toFixed(2)}%`,
            "Year position":    `${(w52Pos * 100).toFixed(0)}% of range`,
          },
          category: "invest",
        });
      }

      /* 3. Near 52-Week High — strong uptrend, sellers cleared */
      else if (w52Pos >= 0.9 && changePct >= -0.5) {
        signals.push({
          symbol: sym, companyName: name, price, changePercent: changePct,
          signalType: "Near 52-Week High", direction: "bullish",
          strength: clamp(62 + w52Pos * 28),
          headline: `${sym} is within ${((w52High - price) / w52High * 100).toFixed(1)}% of its highest price in a year`,
          detail: `Stocks at all-time or yearly highs are often stronger than they look — it means everyone who bought in the past year is profitable, so there's no "trapped" selling pressure. Trends tend to continue at these levels.`,
          metrics: {
            "52-week high":     `$${w52High.toFixed(2)}`,
            "Distance to high": `${((w52High - price) / w52High * 100).toFixed(1)}% away`,
            "52-week low":      `$${w52Low.toFixed(2)}`,
          },
          category: "invest",
        });
      }

      /* 4. Oversold Bounce — near yearly lows but stabilizing */
      else if (w52Pos <= 0.2 && changePct >= 1.5) {
        signals.push({
          symbol: sym, companyName: name, price, changePercent: changePct,
          signalType: "Oversold Bounce", direction: "bullish",
          strength: clamp(40 + (1 - w52Pos) * 30 + changePct * 3),
          headline: `${sym} bounced ${changePct.toFixed(1)}% from near its 52-week low today`,
          detail: `This stock has fallen a lot this year, but today it started going back up. This type of reversal from the bottom can signal a recovery — though it carries more risk than buying strong trends. Think of it as a potential bargain.`,
          metrics: {
            "Down from yearly high": `-${((w52High - price) / w52High * 100).toFixed(0)}%`,
            "Above yearly low":      `+${((price - w52Low) / w52Low * 100).toFixed(1)}%`,
            "Today's bounce":        `+${changePct.toFixed(2)}%`,
          },
          category: "invest",
        });
      }

      /* 5. Strong Trend — solid mid-range with positive momentum */
      else if (w52Pos >= 0.6 && w52Pos < 0.9 && changePct >= 1.5 && volRatio >= 1.3) {
        signals.push({
          symbol: sym, companyName: name, price, changePercent: changePct,
          signalType: "Trending Up", direction: "bullish",
          strength: clamp(45 + w52Pos * 20 + changePct * 3),
          headline: `${sym} is in a solid uptrend, up ${changePct.toFixed(1)}% today with above-normal volume`,
          detail: `This stock is in the upper half of its yearly price range and moving up with healthy trading activity. It's not overextended, not at the bottom — just steadily climbing. Often the safest momentum to follow.`,
          metrics: {
            "Year range position": `${(w52Pos * 100).toFixed(0)}%`,
            "Today's gain":        `+${changePct.toFixed(2)}%`,
            "Volume vs normal":    `${volRatio.toFixed(1)}×`,
          },
          category: "invest",
        });
      }

      /* ════════════════════════════════════════════════════
         OPTIONS SIGNALS
      ════════════════════════════════════════════════════ */

      /* 1. Pre-Earnings Setup */
      if (daysToEarnings !== null && daysToEarnings >= 4 && daysToEarnings <= 21) {
        const earningsStr = ed
          ? new Date(typeof ed === "number" ? ed * 1000 : ed).toLocaleDateString()
          : "soon";
        signals.push({
          symbol: sym, companyName: name, price, changePercent: changePct,
          signalType: "Pre-Earnings Setup", direction: "neutral",
          strength: clamp(82 - daysToEarnings * 2),
          headline: `${sym} reports earnings in ${daysToEarnings} day${daysToEarnings === 1 ? "" : "s"} on ${earningsStr}`,
          detail: `Options (contracts to buy or sell the stock) get much more expensive as earnings approach — everyone wants protection or a bet on the outcome. After earnings, options prices "deflate" fast. Traders often buy before and sell right before the announcement, or use strategies like straddles to profit from the big move either way.`,
          metrics: {
            "Days to earnings": `${daysToEarnings}`,
            "Current price":    `$${price.toFixed(2)}`,
            "Today":            `${changePct >= 0 ? "+" : ""}${changePct.toFixed(2)}%`,
          },
          category: "options",
        });
      }

      /* 2. Call Opportunity — high-beta stock surging with volume */
      if (beta >= 1.5 && changePct >= 2.5 && volRatio >= 1.5) {
        signals.push({
          symbol: sym, companyName: name, price, changePercent: changePct,
          signalType: "Call Opportunity", direction: "bullish",
          strength: clamp(50 + beta * 7 + changePct * 2.5),
          headline: `${sym} moves ${beta.toFixed(1)}× faster than the market and is surging today`,
          detail: `A "call option" lets you control 100 shares at a fraction of the cost. When a high-beta (fast-moving) stock is already going up strongly with heavy volume, calls can multiply your profits if the move continues. Think of it as buying a leveraged ticket on the rally. Higher risk, higher reward.`,
          metrics: {
            "Beta (speed vs market)": `${beta.toFixed(2)}×`,
            "Today's gain":           `+${changePct.toFixed(2)}%`,
            "Volume activity":        `${volRatio.toFixed(1)}× normal`,
          },
          category: "options",
        });
      }

      /* 3. Short Squeeze Watch */
      if (shortRatio >= 5 && changePct >= 1.5) {
        signals.push({
          symbol: sym, companyName: name, price, changePercent: changePct,
          signalType: "Short Squeeze Watch", direction: "bullish",
          strength: clamp(52 + shortRatio * 2.5 + changePct * 2),
          headline: `${sym} has ${shortRatio.toFixed(1)} days of short interest and is moving up`,
          detail: `Many investors have bet this stock will fall by "shorting" it. When it goes up instead, those investors must buy shares to cut their losses — which pushes the price even higher in a chain reaction called a "short squeeze." The more shorts there are, the bigger the potential squeeze.`,
          metrics: {
            "Days to cover shorts": `${shortRatio.toFixed(1)} days`,
            "Today's move":         `+${changePct.toFixed(2)}%`,
            "Volume level":         `${volRatio.toFixed(1)}× normal`,
          },
          category: "options",
        });
      }

      /* 4. Put Hedge — stock dropping with heavy volume */
      if (changePct <= -3 && volRatio >= 2) {
        signals.push({
          symbol: sym, companyName: name, price, changePercent: changePct,
          signalType: "Put Opportunity", direction: "bearish",
          strength: clamp(50 + Math.abs(changePct) * 4 + volRatio * 3),
          headline: `${sym} is down ${Math.abs(changePct).toFixed(1)}% on ${volRatio.toFixed(1)}× normal selling volume`,
          detail: `A "put option" lets you profit when a stock falls, or protects your portfolio against losses — like insurance. When a stock drops hard on heavy volume, it often means big sellers are exiting. Puts can be a way to profit from, or hedge against, continued selling.`,
          metrics: {
            "Today's drop":     `${changePct.toFixed(2)}%`,
            "Volume vs normal": `${volRatio.toFixed(1)}×`,
            "Near yearly low?": w52Pos < 0.3 ? "Yes — near lows" : "No — room to fall",
          },
          category: "options",
        });
      }

      /* 5. Low-risk premium — stable stock, elevated vol expected */
      if (beta <= 0.7 && w52Pos >= 0.45 && w52Pos <= 0.75 && Math.abs(changePct) < 1) {
        signals.push({
          symbol: sym, companyName: name, price, changePercent: changePct,
          signalType: "Premium Selling Setup", direction: "neutral",
          strength: clamp(48 + (1 - beta) * 25 + (1 - Math.abs(changePct)) * 10),
          headline: `${sym} is calm and stable — good for collecting option premium`,
          detail: `When a stock barely moves and is in a stable range, selling options (collecting the "rent") works well. You sell a put or call at a price you're comfortable with, collect cash upfront, and profit as long as the stock stays put. Think of it like being a landlord — you collect monthly payments and hope nothing goes wrong.`,
          metrics: {
            "Beta (how calm)":  `${beta.toFixed(2)} (low = stable)`,
            "Today's move":     `${changePct >= 0 ? "+" : ""}${changePct.toFixed(2)}%`,
            "Year position":    `${(w52Pos * 100).toFixed(0)}% (mid-range)`,
          },
          category: "options",
        });
      }
    }

    /* ── Sort + deduplicate per category ── */
    const seen  = { invest: new Set<string>(), options: new Set<string>() };
    const deduped = signals
      .sort((a, b) => b.strength - a.strength)
      .filter(s => {
        if (seen[s.category].has(s.symbol)) return false;
        seen[s.category].add(s.symbol);
        return true;
      });

    const result = {
      invest:      deduped.filter(s => s.category === "invest").slice(0, 12),
      options:     deduped.filter(s => s.category === "options").slice(0, 12),
      generatedAt: new Date().toISOString(),
    };

    cache.set(cacheKey, result, 5 * 60_000);
    return res.json(result);
  } catch (err) {
    req.log.error({ err }, "Signals fetch failed");
    return res.status(500).json({ error: "Failed to generate signals" });
  }
});

export default router;
