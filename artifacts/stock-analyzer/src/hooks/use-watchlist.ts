import { useState, useEffect, useCallback } from "react";

export interface WatchlistPosition {
  symbol: string;
  shares: number;
  avgCost: number;
  addedAt: string;
}

const STORAGE_KEY = "deepberg_watchlist_v1";

function readPositions(): WatchlistPosition[] {
  try {
    const current = localStorage.getItem(STORAGE_KEY);
    return JSON.parse(current ?? "[]") as WatchlistPosition[];
  } catch {
    return [];
  }
}

/** Public-demo positions are isolated to this browser. */
export function useWatchlist() {
  const [positions, setPositions] = useState<WatchlistPosition[]>([]);

  useEffect(() => setPositions(readPositions()), []);
  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(positions));
  }, [positions]);

  const addPosition = useCallback(async (symbol: string, shares: number, avgCost: number) => {
    const sym = symbol.toUpperCase();
    setPositions((prev) => {
      const i = prev.findIndex((p) => p.symbol === sym);
      if (i >= 0) return prev.map((p, idx) => (idx === i ? { ...p, shares, avgCost } : p));
      return [...prev, { symbol: sym, shares, avgCost, addedAt: new Date().toISOString() }];
    });
  }, []);

  const removePosition = useCallback(async (symbol: string) => {
    const sym = symbol.toUpperCase();
    setPositions((prev) => prev.filter((p) => p.symbol !== sym));
  }, []);

  const updatePosition = useCallback((symbol: string, shares: number, avgCost: number) => {
    return addPosition(symbol, shares, avgCost);
  }, [addPosition]);

  return { positions, addPosition, removePosition, updatePosition };
}
