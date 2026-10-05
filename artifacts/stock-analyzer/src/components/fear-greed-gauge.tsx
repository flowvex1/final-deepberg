import { useQuery } from "@tanstack/react-query";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";

interface FearGreedData {
  score: number;
  label: string;
  color: string;
  vix: number;
  components: Record<string, {
    label: string;
    value: number;
    score: number;
    weight: number;
  }>;
}

const BASE = import.meta.env.BASE_URL.replace(/\/$/, "");

function useFearGreed() {
  return useQuery<FearGreedData>({
    queryKey: ["fear-greed"],
    queryFn: async () => {
      const res = await fetch(`${BASE}/api/fear-greed`);
      if (!res.ok) throw new Error("Failed to fetch");
      return res.json();
    },
    refetchInterval: 60_000,
    staleTime: 30_000,
  });
}

/* ── SVG semicircle gauge ─────────────────────────────── */
function GaugeSVG({ score, color }: { score: number; color: string }) {
  const cx = 120;
  const cy = 110;
  const r = 90;

  // Arc from 180° to 0° (left to right across the top)
  const startAngle = 180;
  const endAngle = 0;
  const totalDeg = 180;

  function polarToXY(angleDeg: number, radius: number) {
    const rad = (angleDeg * Math.PI) / 180;
    return {
      x: cx + radius * Math.cos(rad),
      y: cy - radius * Math.sin(rad),
    };
  }

  function arcPath(aStart: number, aEnd: number, radius: number) {
    const s = polarToXY(aStart, radius);
    const e = polarToXY(aEnd, radius);
    const large = Math.abs(aEnd - aStart) > 180 ? 1 : 0;
    const sweep = aEnd > aStart ? 0 : 1;
    return `M ${s.x} ${s.y} A ${radius} ${radius} 0 ${large} ${sweep} ${e.x} ${e.y}`;
  }

  // Score 0 = leftmost (180°), score 100 = rightmost (0°)
  const needleAngle = startAngle - (score / 100) * totalDeg;
  const needleTip = polarToXY(needleAngle, r - 10);
  const needleBase1 = polarToXY(needleAngle + 90, 8);
  const needleBase2 = polarToXY(needleAngle - 90, 8);

  // Color zones
  const zones = [
    { from: 180, to: 144, color: "#ef4444" },   // Extreme Fear
    { from: 144, to: 108, color: "#f97316" },   // Fear
    { from: 108, to:  72, color: "#facc15" },   // Neutral
    { from:  72, to:  36, color: "#86efac" },   // Greed
    { from:  36, to:   0, color: "#22c55e" },   // Extreme Greed
  ];

  return (
    <svg viewBox="0 0 240 130" className="w-full max-w-[280px] mx-auto">
      {/* Background track */}
      <path
        d={arcPath(180, 0, r)}
        fill="none"
        stroke="#1e2433"
        strokeWidth={18}
        strokeLinecap="round"
      />

      {/* Color zone arcs */}
      {zones.map((z, i) => (
        <path
          key={i}
          d={arcPath(z.from, z.to, r)}
          fill="none"
          stroke={z.color}
          strokeWidth={18}
          strokeLinecap="butt"
          opacity={0.25}
        />
      ))}

      {/* Filled progress arc */}
      {score > 0 && (
        <path
          d={arcPath(180, needleAngle, r)}
          fill="none"
          stroke={color}
          strokeWidth={18}
          strokeLinecap="round"
          opacity={0.9}
        />
      )}

      {/* Zone labels */}
      <text x="6"  y="118" fontSize="7" fill="#ef4444" opacity={0.7} fontFamily="monospace">FEAR</text>
      <text x="192" y="118" fontSize="7" fill="#22c55e" opacity={0.7} fontFamily="monospace" textAnchor="end">GREED</text>

      {/* Needle */}
      <polygon
        points={`${needleTip.x},${needleTip.y} ${needleBase1.x},${needleBase1.y} ${needleBase2.x},${needleBase2.y}`}
        fill={color}
        opacity={0.95}
      />
      <circle cx={cx} cy={cy} r={6} fill={color} />
      <circle cx={cx} cy={cy} r={3} fill="#0f1117" />

      {/* Score in center */}
      <text x={cx} y={cy - 16} textAnchor="middle" fontSize="26" fontWeight="bold" fill="white" fontFamily="monospace">
        {score}
      </text>
    </svg>
  );
}

/* ── Component bar ─────────────────────────────────────── */
function ComponentBar({ label, score, weight }: { label: string; score: number; weight: number }) {
  const color =
    score >= 75 ? "bg-emerald-500" :
    score >= 60 ? "bg-emerald-400" :
    score >= 40 ? "bg-yellow-400" :
    score >= 25 ? "bg-orange-400" :
    "bg-red-500";

  return (
    <div className="space-y-1">
      <div className="flex justify-between items-center text-xs">
        <span className="text-muted-foreground">{label}</span>
        <span className="font-mono font-bold">{score}</span>
      </div>
      <div className="h-1.5 w-full bg-muted rounded-full overflow-hidden">
        <div
          className={`h-full rounded-full transition-all duration-700 ${color}`}
          style={{ width: `${score}%` }}
        />
      </div>
    </div>
  );
}

/* ── Main export ──────────────────────────────────────── */
export function FearGreedGauge() {
  const { data, isLoading, isError } = useFearGreed();

  return (
    <Card className="h-full">
      <CardContent className="p-5 flex flex-col gap-4">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">
            Fear &amp; Greed Index
          </h3>
          {data && (
            <span className="text-xs font-mono text-muted-foreground">
              VIX {data.vix}
            </span>
          )}
        </div>

        {isLoading && (
          <div className="space-y-3">
            <Skeleton className="h-32 w-full rounded-lg" />
            <Skeleton className="h-3 w-2/3 mx-auto" />
            <Skeleton className="h-2 w-full" />
            <Skeleton className="h-2 w-full" />
          </div>
        )}

        {isError && (
          <div className="text-xs text-muted-foreground text-center py-8">
            Unable to load index data.
          </div>
        )}

        {data && !isLoading && (
          <>
            <GaugeSVG score={data.score} color={data.color} />

            <div className="text-center -mt-2">
              <p className="text-lg font-bold font-mono" style={{ color: data.color }}>
                {data.label}
              </p>
              <p className="text-xs text-muted-foreground mt-0.5">
                Score: {data.score} / 100
              </p>
            </div>

            <div className="space-y-2.5 pt-2 border-t border-border/50">
              {Object.values(data.components).map((c) => (
                <ComponentBar key={c.label} label={c.label} score={c.score} weight={c.weight} />
              ))}
            </div>
          </>
        )}
      </CardContent>
    </Card>
  );
}
