interface CacheEntry<T> {
  data: T;
  expiresAt: number;
}

class SimpleCache {
  private store = new Map<string, CacheEntry<unknown>>();

  set<T>(key: string, data: T, ttlMs: number): void {
    this.store.set(key, { data, expiresAt: Date.now() + ttlMs });
  }

  get<T>(key: string): T | null {
    const entry = this.store.get(key);
    if (!entry) return null;
    if (Date.now() > entry.expiresAt) {
      this.store.delete(key);
      return null;
    }
    return entry.data as T;
  }

  has(key: string): boolean {
    return this.get(key) !== null;
  }
}

export const cache = new SimpleCache();

export const TTL = {
  QUOTE: 30_000,       // 30s for real-time quotes
  HISTORY: 300_000,    // 5min for history
  NEWS: 120_000,       // 2min for news
  SEARCH: 60_000,      // 1min for search
  MOVERS: 60_000,      // 1min for market movers
  ANALYSIS: 600_000,   // 10min for AI analysis (expensive)
};
