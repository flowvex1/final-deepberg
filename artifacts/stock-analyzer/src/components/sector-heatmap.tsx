import { useQuery } from "@tanstack/react-query";
import { Skeleton } from "@/components/ui/skeleton";
import { ArrowUpRight, ArrowDownRight } from "lucide-react";

interface SectorData {
  symbol: string;
  name: string;
  short: string;
  price: number | null;
  change: number | null;
  changePercent: number | null;
}

const BASE = import.meta.env.BASE_URL.replace(/\/$/, "");

function useSectorHeatmap() {
  return useQuery<SectorData[]>({
    queryKey: ["sector-heatmap"],
    queryFn: async () => {
      const res = await fetch(`${BASE}/api/sectors/heatmap`);
      if (!res.ok) throw new Error("Failed to fetch");
      return res.json();
    },
    refetchInterval: 60_000,
    staleTime: 30_000,
  });
}

function tileColor(pct: number | null): string {
  if (pct === null) return "bg-muted/40 border-border";
  if (pct >= 2)    return "bg-emerald-500/25 border-emerald-500/50 hover:bg-emerald-500/35";
  if (pct >= 1)    return "bg-emerald-500/15 border-emerald-500/30 hover:bg-emerald-500/25";
  if (pct >= 0)    return "bg-emerald-500/8  border-emerald-500/20 hover:bg-emerald-500/15";
  if (pct >= -1)   return "bg-red-500/8      border-red-500/20     hover:bg-red-500/15";
  if (pct >= -2)   return "bg-red-500/15     border-red-500/30     hover:bg-red-500/25";
  return               "bg-red-500/25     border-red-500/50     hover:bg-red-500/35";
}

function textColor(pct: number | null): string {
  if (pct === null) return "text-muted-foreground";
  return pct >= 0 ? "text-emerald-400" : "text-red-400";
}

export function SectorHeatmap({ hideHeader }: { hideHeader?: boolean } = {}) {
  const { data, isLoading } = useSectorHeatmap();

  if (isLoading) {
    return (
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <Skeleton className="h-4 w-32" />
          <Skeleton className="h-3 w-20" />
        </div>
        <div className="grid grid-cols-4 sm:grid-cols-6 lg:grid-cols-11 gap-1.5">
          {[...Array(11)].map((_, i) => (
            <Skeleton key={i} className="h-16 rounded-lg" />
          ))}
        </div>
      </div>
    );
  }

  if (!data) return null;

  const best = [...data].filter(d => d.changePercent !== null).sort((a, b) => (b.changePercent ?? 0) - (a.changePercent ?? 0))[0];
  const worst = [...data].filter(d => d.changePercent !== null).sort((a, b) => (a.changePercent ?? 0) - (b.changePercent ?? 0))[0];

  return (
    <div className="space-y-3">
      {!hideHeader && (
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">
            Sector Heatmap
          </h3>
          <div className="flex items-center gap-3 text-xs text-muted-foreground font-mono">
            <span className="flex items-center gap-1">
              <span className="h-2 w-2 rounded-sm bg-emerald-500/60 inline-block" />
              Up
            </span>
            <span className="flex items-center gap-1">
              <span className="h-2 w-2 rounded-sm bg-red-500/60 inline-block" />
              Down
            </span>
          </div>
        </div>
      )}

      {/* Tiles */}
      <div className="grid grid-cols-4 sm:grid-cols-6 lg:grid-cols-11 gap-1.5">
        {data.map((sector) => {
          const pct = sector.changePercent;
          const isPos = pct !== null && pct >= 0;
          return (
            <div
              key={sector.symbol}
              className={`heatmap-cell relative flex flex-col items-center justify-center rounded-lg border p-2 cursor-default ${tileColor(pct)}`}
            >
              <span className="text-[10px] font-bold font-mono text-foreground/70 leading-tight text-center">
                {sector.short}
              </span>
              {pct !== null ? (
                <span className={`text-xs font-bold font-mono mt-0.5 flex items-center gap-0 ${textColor(pct)}`}>
                  {isPos
                    ? <ArrowUpRight className="h-2.5 w-2.5" />
                    : <ArrowDownRight className="h-2.5 w-2.5" />}
                  {Math.abs(pct).toFixed(2)}%
                </span>
              ) : (
                <span className="text-[10px] text-muted-foreground mt-0.5">—</span>
              )}
            </div>
          );
        })}
      </div>

      {/* Best / worst callout */}
      {(best || worst) && (
        <div className="flex gap-3 text-xs flex-wrap">
          {best && best.changePercent !== null && (
            <span className="flex items-center gap-1.5 text-emerald-400">
              <ArrowUpRight className="h-3 w-3" />
              <span className="text-muted-foreground">Leading:</span>
              <span className="font-mono font-bold">{best.short}</span>
              <span className="font-mono">+{best.changePercent.toFixed(2)}%</span>
            </span>
          )}
          {worst && worst.changePercent !== null && (
            <span className="flex items-center gap-1.5 text-red-400">
              <ArrowDownRight className="h-3 w-3" />
              <span className="text-muted-foreground">Lagging:</span>
              <span className="font-mono font-bold">{worst.short}</span>
              <span className="font-mono">{worst.changePercent.toFixed(2)}%</span>
            </span>
          )}
        </div>
      )}
    </div>
  );
}
