import { useQuery } from "@tanstack/react-query";
import { ArrowUpRight, ArrowDownRight } from "lucide-react";

interface TickerItem {
  symbol: string;
  price: number;
  change: number;
  changePercent: number;
}

async function fetchTape(): Promise<TickerItem[]> {
  const res = await fetch(`${import.meta.env.BASE_URL}api/ticker-tape`.replace(/\/\//g, "/"));
  if (!res.ok) throw new Error("Failed");
  return res.json();
}

function TickerItem({ item }: { item: TickerItem }) {
  const isPos = item.changePercent >= 0;
  return (
    <span className="inline-flex items-center gap-2 px-5 border-r border-border/30 shrink-0">
      <span className="font-mono font-bold text-xs text-foreground">{item.symbol}</span>
      <span className="font-mono text-xs">${item.price.toFixed(2)}</span>
      <span className={`font-mono text-[11px] flex items-center gap-0.5 ${isPos ? "text-emerald-400" : "text-red-400"}`}>
        {isPos ? <ArrowUpRight className="h-3 w-3" /> : <ArrowDownRight className="h-3 w-3" />}
        {isPos ? "+" : ""}{item.changePercent.toFixed(2)}%
      </span>
    </span>
  );
}

export function TickerTape() {
  const { data } = useQuery<TickerItem[]>({
    queryKey: ["ticker-tape"],
    queryFn: fetchTape,
    refetchInterval: 10_000,
    staleTime: 8_000,
  });

  if (!data || data.length === 0) return null;

  return (
    <div className="w-full overflow-hidden h-8 flex items-center" style={{ background: "rgba(4,21,32,0.94)", borderBottom: "1px solid rgba(216,227,251,0.06)" }}>
      <div
        className="flex whitespace-nowrap"
        style={{
          animation: "ticker-scroll 40s linear infinite",
          width: "max-content",
        }}
      >
        {[...data, ...data].map((item, i) => (
          <TickerItem key={`${item.symbol}-${i}`} item={item} />
        ))}
      </div>

      <style>{`
        @keyframes ticker-scroll {
          0%   { transform: translateX(0); }
          100% { transform: translateX(-50%); }
        }
      `}</style>
    </div>
  );
}
