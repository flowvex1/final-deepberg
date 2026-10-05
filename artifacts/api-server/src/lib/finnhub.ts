const BASE = "https://finnhub.io/api/v1";
const KEY = process.env.FINNHUB_API_KEY ?? "";

export interface FinnhubQuote {
  symbol: string;
  price: number;
  change: number;
  changePercent: number;
  high: number;
  low: number;
  open: number;
  previousClose: number;
}

async function fetchQuote(symbol: string): Promise<FinnhubQuote | null> {
  try {
    const url = `${BASE}/quote?symbol=${encodeURIComponent(symbol)}&token=${KEY}`;
    const res = await fetch(url, { signal: AbortSignal.timeout(5000) });
    if (!res.ok) return null;
    const d = await res.json() as { c: number; d: number; dp: number; h: number; l: number; o: number; pc: number };
    if (!d.c) return null;
    return {
      symbol,
      price: d.c,
      change: d.d,
      changePercent: d.dp,
      high: d.h,
      low: d.l,
      open: d.o,
      previousClose: d.pc,
    };
  } catch {
    return null;
  }
}

export const finnhub = { fetchQuote };
