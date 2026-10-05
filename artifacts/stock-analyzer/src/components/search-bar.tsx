import { useState, useRef, useEffect } from "react";
import { useLocation } from "wouter";
import { Search, ArrowRight } from "lucide-react";
import { useSearchStocks, getSearchStocksQueryKey } from "@workspace/api-client-react";
import { useDebounce } from "@/hooks/use-debounce";
import { useLocalStorage } from "@/hooks/use-local-storage";
import type { StockSearchResult } from "@workspace/api-client-react";

export function SearchBar() {
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(-1);
  const debouncedQuery = useDebounce(query, 250);
  const [, setLocation] = useLocation();
  const [recent, setRecent] = useLocalStorage<StockSearchResult[]>("recent_stocks", []);
  const inputRef = useRef<HTMLInputElement>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);

  const { data: results, isLoading } = useSearchStocks(
    { q: debouncedQuery },
    { query: { enabled: debouncedQuery.length > 1, queryKey: getSearchStocksQueryKey({ q: debouncedQuery }) } }
  );

  const displayItems: StockSearchResult[] =
    results && results.length > 0
      ? results
      : !query && recent.length > 0
      ? recent
      : [];

  const navigateTo = (stock: StockSearchResult) => {
    const newRecent = [stock, ...recent.filter((s) => s.symbol !== stock.symbol)].slice(0, 5);
    setRecent(newRecent);
    setQuery("");
    setOpen(false);
    setActiveIndex(-1);
    setLocation(`/stock/${stock.symbol}`);
  };

  const navigateDirect = (raw: string) => {
    const ticker = raw.trim().toUpperCase();
    if (!ticker) return;
    const match = displayItems.find((s) => s.symbol === ticker);
    if (match) {
      navigateTo(match);
    } else {
      setQuery("");
      setOpen(false);
      setLocation(`/stock/${ticker}`);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (!open || displayItems.length === 0) {
      if (e.key === "Enter") {
        navigateDirect(query);
      }
      return;
    }
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setActiveIndex((i) => Math.min(i + 1, displayItems.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActiveIndex((i) => Math.max(i - 1, -1));
    } else if (e.key === "Enter") {
      e.preventDefault();
      if (activeIndex >= 0 && displayItems[activeIndex]) {
        navigateTo(displayItems[activeIndex]);
      } else {
        navigateDirect(query);
      }
    } else if (e.key === "Escape") {
      setOpen(false);
      setActiveIndex(-1);
    }
  };

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (
        dropdownRef.current && !dropdownRef.current.contains(e.target as Node) &&
        inputRef.current && !inputRef.current.contains(e.target as Node)
      ) {
        setOpen(false);
        setActiveIndex(-1);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const showDropdown = open && (displayItems.length > 0 || isLoading);
  const isShowingRecent = !query || query.length === 0;

  return (
    <div className="relative w-full max-w-xl">
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground pointer-events-none" />
        <input
          ref={inputRef}
          type="text"
          value={query}
          onChange={(e) => {
            setQuery(e.target.value);
            setOpen(true);
            setActiveIndex(-1);
          }}
          onFocus={() => setOpen(true)}
          onKeyDown={handleKeyDown}
          placeholder="Enter ticker or company name, press Enter..."
          className="w-full pl-9 pr-10 py-2 h-10 rounded-md border border-border bg-card text-sm font-mono shadow-sm focus:outline-none focus:ring-2 focus:ring-primary/50 placeholder:text-muted-foreground/60"
          autoComplete="off"
          spellCheck={false}
        />
        {query && (
          <button
            onClick={() => navigateDirect(query)}
            className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-primary transition-colors p-1 rounded"
            tabIndex={-1}
            title="Analyze"
          >
            <ArrowRight className="h-4 w-4" />
          </button>
        )}
      </div>

      {showDropdown && (
        <div
          ref={dropdownRef}
          className="absolute z-50 mt-1 w-full rounded-md border border-border bg-popover shadow-lg overflow-hidden"
        >
          {isLoading && query.length > 1 ? (
            <div className="px-4 py-3 text-sm text-muted-foreground font-mono">Searching...</div>
          ) : (
            <>
              {displayItems.length > 0 && (
                <div>
                  <div className="px-3 py-1.5 text-xs font-semibold text-muted-foreground uppercase tracking-wider border-b border-border/50">
                    {isShowingRecent ? "Recently Viewed" : "Results"}
                  </div>
                  <ul>
                    {displayItems.map((stock, i) => (
                      <li
                        key={stock.symbol}
                        onMouseDown={() => navigateTo(stock)}
                        onMouseEnter={() => setActiveIndex(i)}
                        className={`flex justify-between items-center px-3 py-2.5 cursor-pointer transition-colors ${
                          i === activeIndex ? "bg-accent" : "hover:bg-accent/50"
                        }`}
                      >
                        <div className="flex flex-col min-w-0">
                          <span className="font-bold font-mono text-sm">{stock.symbol}</span>
                          <span className="text-xs text-muted-foreground truncate">{stock.name}</span>
                        </div>
                        <span className="text-xs text-muted-foreground uppercase ml-3 shrink-0">
                          {stock.type || "EQ"} · {stock.exchange}
                        </span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
              {!isLoading && results && results.length === 0 && query.length > 1 && (
                <div
                  onMouseDown={() => navigateDirect(query)}
                  className="px-3 py-3 cursor-pointer hover:bg-accent/50 transition-colors flex items-center gap-2"
                >
                  <ArrowRight className="h-4 w-4 text-primary shrink-0" />
                  <span className="text-sm font-mono">
                    Analyze <span className="font-bold text-primary">{query.toUpperCase()}</span> directly
                  </span>
                </div>
              )}
            </>
          )}
        </div>
      )}
    </div>
  );
}
