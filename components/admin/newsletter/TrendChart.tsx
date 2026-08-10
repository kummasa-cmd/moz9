"use client";

import { useMemo, useRef, useState } from "react";

type Point = { date: string; count: number };

type Props = {
  data: Point[];
  color?: string;
  height?: number;
};

const VIEW_WIDTH = 640;
const PADDING = { top: 16, right: 12, bottom: 24, left: 32 };

function niceCeil(value: number): number {
  if (value <= 5) return 5;
  const magnitude = Math.pow(10, Math.floor(Math.log10(value)));
  const residual = value / magnitude;
  const niceResidual = residual <= 1 ? 1 : residual <= 2 ? 2 : residual <= 5 ? 5 : 10;
  return niceResidual * magnitude;
}

function formatDate(iso: string): string {
  const d = new Date(iso);
  return `${d.getMonth() + 1}/${d.getDate()}`;
}

export function TrendChart({ data, color = "#3B5BFF", height = 200 }: Props) {
  const svgRef = useRef<SVGSVGElement>(null);
  const [hoverIndex, setHoverIndex] = useState<number | null>(null);

  const { linePath, areaPath, points, yTicks, innerHeight } = useMemo(() => {
    const innerWidth = VIEW_WIDTH - PADDING.left - PADDING.right;
    const innerH = height - PADDING.top - PADDING.bottom;
    const max = niceCeil(Math.max(1, ...data.map((d) => d.count)));
    const xStep = data.length > 1 ? innerWidth / (data.length - 1) : 0;

    const pts = data.map((d, i) => ({
      x: PADDING.left + i * xStep,
      y: PADDING.top + innerH - (d.count / max) * innerH,
      ...d,
    }));

    const line = pts.map((p, i) => `${i === 0 ? "M" : "L"} ${p.x.toFixed(1)} ${p.y.toFixed(1)}`).join(" ");
    const area =
      pts.length > 0
        ? `${line} L ${pts[pts.length - 1].x.toFixed(1)} ${(PADDING.top + innerH).toFixed(1)} L ${pts[0].x.toFixed(1)} ${(PADDING.top + innerH).toFixed(1)} Z`
        : "";

    return {
      linePath: line,
      areaPath: area,
      points: pts,
      yTicks: [0, 0.5, 1].map((t) => Math.round(max * t)),
      innerHeight: innerH,
    };
  }, [data, height]);

  function handleMove(e: React.MouseEvent<SVGSVGElement>) {
    if (!svgRef.current || points.length === 0) return;
    const rect = svgRef.current.getBoundingClientRect();
    const relativeX = ((e.clientX - rect.left) / rect.width) * VIEW_WIDTH;
    let nearest = 0;
    let nearestDist = Infinity;
    points.forEach((p, i) => {
      const dist = Math.abs(p.x - relativeX);
      if (dist < nearestDist) {
        nearestDist = dist;
        nearest = i;
      }
    });
    setHoverIndex(nearest);
  }

  const hovered = hoverIndex !== null ? points[hoverIndex] : null;
  const firstLabel = data[0] ? formatDate(data[0].date) : "";
  const lastLabel = data[data.length - 1] ? formatDate(data[data.length - 1].date) : "";

  return (
    <div className="relative">
      <svg
        ref={svgRef}
        viewBox={`0 0 ${VIEW_WIDTH} ${height}`}
        className="w-full"
        onMouseMove={handleMove}
        onMouseLeave={() => setHoverIndex(null)}
      >
        {yTicks.map((tick, i) => {
          const y = PADDING.top + innerHeight - (i / (yTicks.length - 1)) * innerHeight;
          return (
            <g key={tick + "-" + i}>
              <line
                x1={PADDING.left}
                x2={VIEW_WIDTH - PADDING.right}
                y1={y}
                y2={y}
                stroke="#e5e7eb"
                strokeWidth={1}
              />
              <text x={4} y={y + 3} fontSize={10} fill="#898781">
                {tick.toLocaleString()}
              </text>
            </g>
          );
        })}

        {areaPath && <path d={areaPath} fill={color} fillOpacity={0.1} stroke="none" />}
        {linePath && (
          <path d={linePath} fill="none" stroke={color} strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" />
        )}

        {hovered && (
          <line
            x1={hovered.x}
            x2={hovered.x}
            y1={PADDING.top}
            y2={PADDING.top + innerHeight}
            stroke="#c3c2b7"
            strokeWidth={1}
          />
        )}
        {hovered && (
          <circle cx={hovered.x} cy={hovered.y} r={4} fill={color} stroke="#ffffff" strokeWidth={2} />
        )}

        <text x={PADDING.left} y={height - 4} fontSize={10} fill="#898781">
          {firstLabel}
        </text>
        <text x={VIEW_WIDTH - PADDING.right} y={height - 4} fontSize={10} fill="#898781" textAnchor="end">
          {lastLabel}
        </text>
      </svg>

      {hovered && (
        <div
          className="pointer-events-none absolute -translate-x-1/2 -translate-y-full rounded-md border border-border bg-white px-2 py-1 text-xs shadow-sm"
          style={{
            left: `${(hovered.x / VIEW_WIDTH) * 100}%`,
            top: `${(hovered.y / height) * 100}%`,
          }}
        >
          <span className="text-muted-foreground">{formatDate(hovered.date)}</span>{" "}
          <span className="font-semibold text-foreground">{hovered.count.toLocaleString()}</span>
        </div>
      )}
    </div>
  );
}
