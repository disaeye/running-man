"use client";

import { ArrowUp, ArrowDown, Minus } from "lucide-react";
import type { PmcPoint } from "@features/pmc/hooks/usePmcData";

function delta7(series: number[]): { value: number; direction: "up" | "down" | "stable" } {
  if (series.length < 2) return { value: 0, direction: "stable" };
  const latest = series[series.length - 1]!;
  const idx7 = Math.max(0, series.length - 8);
  const weekAgo = series[idx7]!;
  const diff = latest - weekAgo;
  if (Math.abs(diff) < 0.5) return { value: diff, direction: "stable" };
  return { value: diff, direction: diff > 0 ? "up" : "down" };
}

function DeltaArrow({ direction }: { direction: "up" | "down" | "stable" }) {
  if (direction === "stable") {
    return <Minus className="h-3 w-3 text-text-muted" aria-label="持平" />;
  }
  const isUp = direction === "up";
  return (
    <span
      className={`inline-flex items-center ${isUp ? "text-success" : "text-error"}`}
      aria-label={isUp ? "上升" : "下降"}
    >
      {isUp ? (
        <ArrowUp className="h-3 w-3" aria-hidden />
      ) : (
        <ArrowDown className="h-3 w-3" aria-hidden />
      )}
    </span>
  );
}

export function PmcStatBlocks({ data }: { data: PmcPoint[] }) {
  const ctlSeries = data.map((p) => p.ctl);
  const atlSeries = data.map((p) => p.atl);
  const tsbSeries = data.map((p) => p.tsb);

  const latest = data[data.length - 1];
  const ctlDelta = delta7(ctlSeries);
  const atlDelta = delta7(atlSeries);
  const tsbDelta = delta7(tsbSeries);

  const stats = [
    { label: "CTL", value: latest?.ctl.toFixed(1) ?? "--", delta: ctlDelta, colorClass: "text-ctl" },
    { label: "ATL", value: latest?.atl.toFixed(1) ?? "--", delta: atlDelta, colorClass: "text-atl" },
    { label: "TSB", value: latest?.tsb.toFixed(1) ?? "--", delta: tsbDelta, colorClass: "text-tsb" },
  ];

  return (
    <div className="grid grid-cols-3 gap-3" data-testid="pmc-stat-blocks">
      {stats.map((s) => (
        <div key={s.label} className="flex flex-col items-center gap-0.5">
          <span className="text-caption2 font-medium text-text-muted">{s.label}</span>
          <span className={`font-mono tabular-nums text-display-sm font-bold ${s.colorClass}`}>
            {s.value}
          </span>
          <span className="flex items-center gap-0.5 text-caption2">
            <DeltaArrow direction={s.delta.direction} />
            <span className="text-text-muted">{Math.abs(s.delta.value).toFixed(1)}</span>
          </span>
        </div>
      ))}
    </div>
  );
}
