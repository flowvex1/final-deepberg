import { Router } from "express";
import { cache } from "../lib/cache";
import { yf } from "../lib/yahoo";

const router = Router();

const SECTORS = [
  { symbol: "XLK",  name: "Technology",         short: "Tech"       },
  { symbol: "XLF",  name: "Financials",          short: "Finance"    },
  { symbol: "XLV",  name: "Healthcare",          short: "Health"     },
  { symbol: "XLE",  name: "Energy",              short: "Energy"     },
  { symbol: "XLY",  name: "Consumer Discret.",   short: "Cons. Disc" },
  { symbol: "XLP",  name: "Consumer Staples",    short: "Staples"    },
  { symbol: "XLI",  name: "Industrials",         short: "Industrial" },
  { symbol: "XLB",  name: "Materials",           short: "Materials"  },
  { symbol: "XLRE", name: "Real Estate",         short: "Real Est."  },
  { symbol: "XLC",  name: "Comm. Services",      short: "Comm."      },
  { symbol: "XLU",  name: "Utilities",           short: "Utilities"  },
];

router.get("/sectors/heatmap", async (req, res) => {
  const cacheKey = "sectors:heatmap";
  const cached = cache.get(cacheKey);
  if (cached) { res.json(cached); return; }

  try {
    const results = await Promise.allSettled(
      SECTORS.map((s) => yf.quote(s.symbol))
    );

    const heatmap = SECTORS.map((s, i) => {
      const r = results[i];
      if (r.status !== "fulfilled" || !r.value) {
        return { ...s, price: null, changePercent: null, change: null };
      }
      const q = r.value;
      return {
        ...s,
        price:         q.regularMarketPrice ?? null,
        change:        q.regularMarketChange ?? null,
        changePercent: q.regularMarketChangePercent ?? null,
      };
    });

    cache.set(cacheKey, heatmap, 5);
    res.json(heatmap);
  } catch (err) {
    req.log.error(err, "Sector heatmap fetch failed");
    res.status(500).json({ error: "Failed to fetch sector data" });
  }
});

export default router;
