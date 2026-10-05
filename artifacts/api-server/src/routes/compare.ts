import { Router } from "express";
import { yf } from "../lib/yahoo";

const router = Router();

function safeNum(v: any): number | null {
  if (v == null || isNaN(Number(v))) return null;
  return Number(v);
}

function buildStock(symbol: string, q: any, chart: any) {
  /* Normalized 30-day price series (rebased to 0%) */
  const rawQuotes: { date: Date | string | number; close: number }[] =
    (chart?.quotes ?? []).filter((x: any) => x.close != null);
  const base = rawQuotes[0]?.close ?? null;
  const series = base
    ? rawQuotes.map((x) => {
        const d = x.date instanceof Date ? x.date : new Date(x.date);
        return {
          date: isNaN(d.getTime()) ? String(x.date).slice(0, 10) : d.toISOString().slice(0, 10),
          pct:  parseFloat((((x.close - base) / base) * 100).toFixed(2)),
        };
      })
    : [];

  const w52Low  = safeNum(q?.fiftyTwoWeekLow);
  const w52High = safeNum(q?.fiftyTwoWeekHigh);
  const price   = safeNum(q?.regularMarketPrice);
  const w52Pos  = (price !== null && w52Low !== null && w52High !== null && w52High > w52Low)
    ? parseFloat((((price - w52Low) / (w52High - w52Low)) * 100).toFixed(1))
    : null;

  return {
    symbol,
    name:           q?.longName ?? q?.shortName ?? symbol,
    sector:         q?.sector ?? q?.industry ?? null,
    exchange:       q?.fullExchangeName ?? null,
    price,
    change:         safeNum(q?.regularMarketChange),
    changePercent:  safeNum(q?.regularMarketChangePercent),
    /* Performance */
    w52High, w52Low, w52Pos,
    beta:           safeNum(q?.beta),
    /* Valuation */
    marketCap:      safeNum(q?.marketCap),
    trailingPE:     safeNum(q?.trailingPE),
    forwardPE:      safeNum(q?.forwardPE),
    priceToSales:   safeNum(q?.priceToSalesTrailing12Months),
    priceToBook:    safeNum(q?.priceToBook),
    /* Fundamentals */
    revenue:        safeNum(q?.totalRevenue ?? q?.revenueQuarterlyGrowth),
    eps:            safeNum(q?.epsTrailingTwelveMonths),
    forwardEps:     safeNum(q?.epsForward),
    profitMargin:   safeNum(q?.profitMargins),
    /* Dividends */
    dividendYield:  safeNum(q?.dividendYield),
    /* Volume */
    volume:         safeNum(q?.regularMarketVolume),
    avgVolume:      safeNum(q?.averageVolume),
    /* Chart */
    series,
  };
}

router.get("/compare", async (req, res) => {
  const a = ((req.query.a as string) ?? "").trim().toUpperCase();
  const b = ((req.query.b as string) ?? "").trim().toUpperCase();

  if (!a || !b) {
    res.status(400).json({ error: "Two symbols required (?a=X&b=Y)" });
    return;
  }

  const since = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);

  try {
    const [qaR, qbR, caR, cbR] = await Promise.allSettled([
      yf.quote(a),
      yf.quote(b),
      yf.chart(a, { period1: since, interval: "1d" }),
      yf.chart(b, { period1: since, interval: "1d" }),
    ]);

    const qa = qaR.status === "fulfilled" ? qaR.value : null;
    const qb = qbR.status === "fulfilled" ? qbR.value : null;
    const ca = caR.status === "fulfilled" ? caR.value : null;
    const cb = cbR.status === "fulfilled" ? cbR.value : null;

    if (!qa) { res.status(404).json({ error: `Symbol ${a} not found` }); return; }
    if (!qb) { res.status(404).json({ error: `Symbol ${b} not found` }); return; }

    res.json({ a: buildStock(a, qa, ca), b: buildStock(b, qb, cb) });
  } catch (err) {
    req.log.error(err, "Compare fetch failed");
    res.status(500).json({ error: "Failed to fetch comparison data" });
  }
});

export default router;
