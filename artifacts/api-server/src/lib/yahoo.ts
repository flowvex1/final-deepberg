import YahooFinance from "yahoo-finance2";

const yf2 = new YahooFinance({
  suppressNotices: ["yahooSurvey"],
  validation: {
    logErrors: false,
    logOptionsErrors: false,
    allowAdditionalProps: true,
  },
});

// yahoo-finance2 v3 takes module options as the 3rd arg directly ({ validateResult }).
// The previous `{ moduleOptions: { validateResult: false } }` shape was ignored, so
// schema validation still ran and threw on endpoints like screener (empty movers).
const noValidate = { validateResult: false as const };

async function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function withRetry<T>(fn: () => Promise<T>, retries = 4, delayMs = 3000): Promise<T> {
  for (let i = 0; i < retries; i++) {
    try {
      return await fn();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      const isTooMany = msg.includes("Too Many") || msg.includes("429");
      if (isTooMany && i < retries - 1) {
        await sleep(delayMs * (i + 1));
        continue;
      }
      throw err;
    }
  }
  throw new Error("Max retries exceeded");
}

export const yf = {
  quote: (symbol: string, opts?: Parameters<typeof yf2.quote>[1]): Promise<any> =>
    withRetry<any>(() => yf2.quote(symbol, opts, noValidate)),
  search: (q: string, opts?: Parameters<typeof yf2.search>[1]): Promise<any> =>
    withRetry<any>(() => yf2.search(q, opts, noValidate)),
  chart: (symbol: string, opts: Parameters<typeof yf2.chart>[1]): Promise<any> =>
    withRetry<any>(() => yf2.chart(symbol, opts as any, noValidate)),
  screener: (scrId: string, opts?: { count?: number }): Promise<any> =>
    withRetry(() =>
      (yf2.screener as (
        id: string,
        opts?: { count?: number },
        moduleOpts?: typeof noValidate,
      ) => ReturnType<typeof yf2.screener>)(scrId, opts, noValidate)
    ),
  options: (symbol: string, opts?: { date?: Date }): Promise<any> =>
    withRetry<any>(() => yf2.options(symbol, opts, noValidate as any)),
  quoteSummary: (symbol: string, opts: Parameters<typeof yf2.quoteSummary>[1]): Promise<any> =>
    withRetry<any>(() => yf2.quoteSummary(symbol, opts, noValidate as any)),
};
