import { Router } from "express";
import { cache } from "../lib/cache";
import { yf } from "../lib/yahoo";
import { openai, AI_MODEL, AI_ENABLED } from "@workspace/integrations-openai-ai-server";

const router = Router();
const newsSummaryJobs = new Set<string>();

function bestThumb(thumbnail: any): string | null {
  const resolutions: { url: string; width?: number }[] = thumbnail?.resolutions ?? [];
  if (!resolutions.length) return null;
  const sorted = [...resolutions].sort((a, b) => (b.width ?? 0) - (a.width ?? 0));
  return sorted[0]?.url ?? null;
}

const SECTORS: Record<string, { label: string; queries: string[]; etf: string }> = {
  all:        { label: "All Markets",  queries: ["stock market today wall street", "S&P 500"],          etf: "SPY"  },
  tech:       { label: "Technology",   queries: ["technology AI semiconductor chips"],                    etf: "XLK"  },
  energy:     { label: "Energy",       queries: ["oil gas energy prices OPEC"],                           etf: "XLE"  },
  health:     { label: "Healthcare",   queries: ["healthcare biotech pharma FDA approval"],               etf: "XLV"  },
  finance:    { label: "Financials",   queries: ["banks interest rates Federal Reserve earnings"],         etf: "XLF"  },
  consumer:   { label: "Consumer",     queries: ["retail consumer spending e-commerce"],                   etf: "XLY"  },
  industrial: { label: "Industrials",  queries: ["manufacturing defense aerospace supply chain"],          etf: "XLI"  },
};

router.get("/news", async (req, res) => {
  const sector = ((req.query.sector as string) ?? "all").toLowerCase();
  const config = SECTORS[sector] ?? SECTORS.all;
  const cacheKey = `news:sector:${sector}`;

  const cached = cache.get(cacheKey);
  if (cached) { res.json(cached); return; }

  try {
    const fetches = [
      ...config.queries.map((q) => yf.search(q, { newsCount: 8, quotesCount: 0 })),
      yf.search(config.etf, { newsCount: 8, quotesCount: 0 }),
    ];
    const results = await Promise.allSettled(fetches);

    const seen = new Set<string>();
    const articles: any[] = [];
    for (const r of results) {
      if (r.status !== "fulfilled") continue;
      for (const n of r.value.news ?? []) {
        if (!n.title || seen.has(n.title)) continue;
        seen.add(n.title);
        articles.push({
          title:       n.title,
          publisher:   n.publisher ?? "",
          link:        n.link ?? "",
          publishedAt: n.providerPublishTime
            ? new Date(n.providerPublishTime).toISOString()
            : new Date().toISOString(),
          thumbnail:   bestThumb(n.thumbnail),
          summary:     "",
        });
      }
    }

    const sliced = articles.slice(0, 18);

    const result = { sector, label: config.label, articles: sliced };
    // Headlines should never wait for the local AI service. Cache and return
    // immediately, then enrich the cache with summaries in the background.
    cache.set(cacheKey, result, 15 * 60_000);
    res.json(result);

    if (AI_ENABLED && sliced.length > 0 && !newsSummaryJobs.has(cacheKey)) {
      newsSummaryJobs.add(cacheKey);
      void (async () => {
        try {
          const titles = sliced.map((a, i) => `${i + 1}. ${a.title}`).join("\n");
          const completion = await openai.chat.completions.create({
            model: AI_MODEL,
            max_completion_tokens: 1200,
            messages: [{
              role: "user",
              content: `You are a financial news analyst. For each headline below, write exactly 2 sentences explaining what the story is about and why it matters to investors. Be crisp and market-focused. Return ONLY a JSON array of strings, one per headline, in the same order. No markdown, no keys — just the array.\n\nHeadlines:\n${titles}`,
            }],
          });
          const raw = completion.choices[0]?.message?.content?.trim() ?? "[]";
          const cleaned = raw.replace(/^```json\s*/i, "").replace(/^```\s*/i, "").replace(/```\s*$/, "").trim();
          const summaries: string[] = JSON.parse(cleaned);
          const enriched = sliced.map((article, i) => ({
            ...article,
            summary: summaries[i] || "",
          }));
          cache.set(cacheKey, { sector, label: config.label, articles: enriched }, 15 * 60_000);
        } catch (e) {
          req.log.warn(e, "Article summary generation failed — headlines remain available");
        } finally {
          newsSummaryJobs.delete(cacheKey);
        }
      })();
    }
  } catch (err) {
    req.log.error(err, "Sector news fetch failed");
    res.status(500).json({ error: "Failed to fetch news" });
  }
});

/* ── GET /sector-sentiment ─────────────────────────────────────────────────── */
router.get("/sector-sentiment", async (req, res) => {
  const cacheKey = "sector:sentiment";
  const cached = cache.get(cacheKey);
  if (cached) { res.json(cached); return; }

  const ETF_MAP: Record<string, string> = {
    all:        "SPY",
    tech:       "XLK",
    energy:     "XLE",
    health:     "XLV",
    finance:    "XLF",
    consumer:   "XLY",
    industrial: "XLI",
  };

  try {
    const symbols = Object.values(ETF_MAP);
    const quotes = await Promise.allSettled(
      symbols.map(s => yf.quote(s, { fields: ["regularMarketChangePercent", "regularMarketPrice", "symbol"] }))
    );

    const result: Record<string, { etf: string; changePercent: number; price: number }> = {};
    Object.entries(ETF_MAP).forEach(([sector, etf], i) => {
      const r = quotes[i];
      if (r.status === "fulfilled" && r.value) {
        result[sector] = {
          etf,
          changePercent: r.value.regularMarketChangePercent ?? 0,
          price: r.value.regularMarketPrice ?? 0,
        };
      } else {
        result[sector] = { etf, changePercent: 0, price: 0 };
      }
    });

    cache.set(cacheKey, result, 5 * 60_000);
    res.json(result);
  } catch (err) {
    req.log.error(err, "Sector sentiment fetch failed");
    res.status(500).json({ error: "Failed to fetch sector sentiment" });
  }
});

router.get("/market-summary", async (req, res) => {
  const cacheKey = "market:summary";
  const cached = cache.get(cacheKey);
  if (cached) { res.json(cached); return; }

  try {
    const INDEX_SYMBOLS = ["SPY", "QQQ", "DIA", "^VIX"];
    const [quotesResult, newsResult] = await Promise.allSettled([
      Promise.allSettled(INDEX_SYMBOLS.map((s) => yf.quote(s))),
      yf.search("stock market today wall street economy", { newsCount: 8, quotesCount: 0 }),
    ]);

    const indices: any[] = [];
    if (quotesResult.status === "fulfilled") {
      quotesResult.value.forEach((r, i) => {
        if (r.status !== "fulfilled" || !r.value) return;
        const q = r.value;
        indices.push({
          symbol:        INDEX_SYMBOLS[i].replace("^", ""),
          name:          q.longName ?? q.shortName ?? INDEX_SYMBOLS[i],
          price:         q.regularMarketPrice ?? 0,
          change:        q.regularMarketChange ?? 0,
          changePercent: q.regularMarketChangePercent ?? 0,
        });
      });
    }

    const vix = indices.find((i) => i.symbol === "VIX");
    const spy = indices.find((i) => i.symbol === "SPY");
    const mood: string = !vix ? "neutral" : vix.price > 30 ? "extreme_fear" : vix.price > 20 ? "fear" : vix.price > 15 ? "neutral" : "greed";

    const rawNews = newsResult.status === "fulfilled" ? (newsResult.value.news ?? []) : [];
    const topHeadlines = rawNews.slice(0, 6).map((n: any) => ({
      title:       n.title ?? "",
      publisher:   n.publisher ?? "",
      link:        n.link ?? "",
      publishedAt: n.providerPublishTime ? new Date(n.providerPublishTime).toISOString() : new Date().toISOString(),
      thumbnail:   bestThumb(n.thumbnail),
    }));

    let summary = "";
    try {
      if (!AI_ENABLED) throw new Error("AI disabled");
      const headlineText = rawNews.slice(0, 5).map((n: any) => `- ${n.title}`).join("\n");
      const prompt = `You are a professional market analyst. Write a sharp 2-3 sentence market summary for today based on:

SPY: ${spy ? `$${spy.price.toFixed(2)} (${spy.changePercent >= 0 ? "+" : ""}${spy.changePercent.toFixed(2)}%)` : "N/A"}
VIX: ${vix ? vix.price.toFixed(1) : "N/A"} — market mood: ${mood.replace("_", " ")}

Headlines:
${headlineText}

Write 2-3 crisp sentences covering: overall direction, key macro driver, and what to watch. No markdown, no lists.`;

      const completion = await openai.chat.completions.create({
        model: AI_MODEL,
        max_completion_tokens: 180,
        messages: [{ role: "user", content: prompt }],
      });
      summary = completion.choices[0]?.message?.content?.trim() ?? "";
    } catch { /* fallback to empty */ }

    const result = { indices, mood, summary, topHeadlines, generatedAt: new Date().toISOString() };
    cache.set(cacheKey, result, 15 * 60_000);
    res.json(result);
  } catch (err) {
    req.log.error(err, "Market summary failed");
    res.status(500).json({ error: "Failed to fetch market summary" });
  }
});

export default router;
