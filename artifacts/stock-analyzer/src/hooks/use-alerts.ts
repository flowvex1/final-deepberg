import { useState, useEffect, useRef, useCallback } from "react";
import { useLocalStorage } from "./use-local-storage";

export type AlertType =
  | "volume"
  | "price_up"
  | "price_down"
  | "breakout52h"
  | "breakdown52l"
  | "day_high_break"
  | "gap_up"
  | "gap_down";

export interface StockAlert {
  id: string;
  symbol: string;
  type: AlertType;
  message: string;
  timestamp: number;
  seen: boolean;
}

interface Baseline {
  price: number;
  volume: number;
  avgVolume: number;
  fiftyTwoWeekHigh: number | null;
  fiftyTwoWeekLow: number | null;
  previousClose: number | null;
  dayHigh: number | null;
  open: number | null;
  gapChecked: boolean;
}

const DEFAULT_WATCHLIST = ["NVDA", "TSLA", "AMD", "AAPL", "SPY"];

export function useAlerts(intervalMs = 60000) {
  const [watchlist, setWatchlist] = useLocalStorage<string[]>("alerts_watchlist", DEFAULT_WATCHLIST);
  const [alerts, setAlerts] = useLocalStorage<StockAlert[]>("alerts_feed", []);
  const [isPolling, setIsPolling] = useState(false);
  const baseline = useRef<Record<string, Baseline>>({});
  const firstRun = useRef(true);

  const addAlert = useCallback((alert: Omit<StockAlert, "id" | "timestamp" | "seen">) => {
    const newAlert: StockAlert = {
      ...alert,
      id: `${alert.symbol}-${alert.type}-${Date.now()}`,
      timestamp: Date.now(),
      seen: false,
    };
    setAlerts((prev) => [newAlert, ...prev].slice(0, 100));
  }, [setAlerts]);

  const poll = useCallback(async () => {
    if (!watchlist.length) return;
    setIsPolling(true);
    try {
      const base = import.meta.env.BASE_URL.replace(/\/$/, "");
      await Promise.allSettled(
        watchlist.map(async (symbol) => {
          try {
            const res = await fetch(`${base}/api/stocks/${symbol}`);
            if (!res.ok) return;
            const data = await res.json();
            const prev = baseline.current[symbol];

            const price: number        = data.price ?? 0;
            const volume: number       = data.volume ?? 0;
            const avgVolume: number    = data.avgVolume ?? 1;
            const high52: number|null  = data.fiftyTwoWeekHigh ?? null;
            const low52: number|null   = data.fiftyTwoWeekLow ?? null;
            const prevClose: number|null = data.previousClose ?? null;
            const dayHigh: number|null = data.high ?? null;
            const open: number|null    = data.open ?? null;

            if (prev && !firstRun.current) {
              // ─── Volume spike: current > 2x average ───────────────────────
              if (volume > avgVolume * 2 && prev.volume <= prev.avgVolume * 2) {
                addAlert({
                  symbol, type: "volume",
                  message: `Volume spike: ${(volume / avgVolume).toFixed(1)}× avg (${(volume / 1000).toFixed(0)}K vs ${(avgVolume / 1000).toFixed(0)}K avg)`,
                });
              }

              // ─── Price move > 2% since last poll ─────────────────────────
              if (prev.price > 0) {
                const pct = ((price - prev.price) / prev.price) * 100;
                if (pct >= 2) {
                  addAlert({ symbol, type: "price_up",
                    message: `Surged +${pct.toFixed(1)}% → $${price.toFixed(2)} (was $${prev.price.toFixed(2)})` });
                } else if (pct <= -2) {
                  addAlert({ symbol, type: "price_down",
                    message: `Dropped ${pct.toFixed(1)}% → $${price.toFixed(2)} (was $${prev.price.toFixed(2)})` });
                }
              }

              // ─── 52-week HIGH breakout ────────────────────────────────────
              if (high52 && price > high52 && prev.price <= high52) {
                addAlert({ symbol, type: "breakout52h",
                  message: `52-week HIGH breakout at $${price.toFixed(2)} — new annual high!` });
              }

              // ─── 52-week LOW breakdown ────────────────────────────────────
              if (low52 && price < low52 && prev.price >= low52) {
                addAlert({ symbol, type: "breakdown52l",
                  message: `52-week LOW breakdown at $${price.toFixed(2)} — new annual low.` });
              }

              // ─── Day high breakout with volume ────────────────────────────
              // Price pushes above previous close significantly with above-avg volume
              if (
                prevClose && dayHigh && prev.dayHigh !== null &&
                dayHigh > prevClose * 1.01 &&          // new day high is 1%+ above prev close
                (prev.dayHigh ?? 0) <= prevClose * 1.01 && // wasn't there last poll
                volume > avgVolume * 1.4                // volume confirmation
              ) {
                const breakPct = ((dayHigh - prevClose) / prevClose * 100).toFixed(1);
                addAlert({ symbol, type: "day_high_break",
                  message: `Breaking above prev close $${prevClose.toFixed(2)} → day high $${dayHigh.toFixed(2)} (+${breakPct}%) with ${(volume / avgVolume).toFixed(1)}× volume` });
              }

              // ─── Gap up ──────────────────────────────────────────────────
              if (
                !prev.gapChecked && open !== null && prevClose !== null &&
                open > prevClose * 1.015
              ) {
                const gapPct = ((open - prevClose) / prevClose * 100).toFixed(1);
                addAlert({ symbol, type: "gap_up",
                  message: `Gap UP: opened $${open.toFixed(2)} vs prev close $${prevClose.toFixed(2)} (+${gapPct}%)` });
              }

              // ─── Gap down ────────────────────────────────────────────────
              if (
                !prev.gapChecked && open !== null && prevClose !== null &&
                open < prevClose * 0.985
              ) {
                const gapPct = ((open - prevClose) / prevClose * 100).toFixed(1);
                addAlert({ symbol, type: "gap_down",
                  message: `Gap DOWN: opened $${open.toFixed(2)} vs prev close $${prevClose.toFixed(2)} (${gapPct}%)` });
              }
            }

            baseline.current[symbol] = {
              price, volume, avgVolume, fiftyTwoWeekHigh: high52, fiftyTwoWeekLow: low52,
              previousClose: prevClose, dayHigh, open,
              gapChecked: prev ? true : false,
            };
          } catch { /* ignore per-symbol errors */ }
        })
      );
    } finally {
      firstRun.current = false;
      setIsPolling(false);
    }
  }, [watchlist, addAlert]);

  useEffect(() => {
    firstRun.current = true;
    baseline.current = {};
    poll();
    const id = setInterval(poll, intervalMs);
    return () => clearInterval(id);
  }, [poll, intervalMs]);

  const addToWatchlist = (symbol: string) => {
    const s = symbol.trim().toUpperCase();
    if (s && !watchlist.includes(s)) setWatchlist((prev) => [...prev, s]);
  };
  const removeFromWatchlist = (symbol: string) => {
    setWatchlist((prev) => prev.filter((s) => s !== symbol));
    delete baseline.current[symbol];
  };
  const markAllSeen = () => setAlerts((prev) => prev.map((a) => ({ ...a, seen: true })));
  const clearAlerts = () => setAlerts([]);
  const unseenCount = alerts.filter((a) => !a.seen).length;

  return { watchlist, alerts, isPolling, unseenCount, addToWatchlist, removeFromWatchlist, markAllSeen, clearAlerts };
}
