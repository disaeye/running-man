"use client";

import { useState } from "react";
import { cn } from "@shared/lib/utils";

export interface ProportionSegment {
  readonly key: string;
  readonly label: string;
  readonly pct: number;
  readonly colorClass: string;
  readonly subLabel?: string;
}

interface ProportionBarProps {
  readonly segments: readonly ProportionSegment[];
  readonly columns?: 3 | 4 | 5;
  readonly showGrid?: boolean;
  readonly ariaLabel?: string;
  readonly className?: string;
}

const GRID_COLUMNS: Record<3 | 4 | 5, string> = {
  3: "grid-cols-3",
  4: "grid-cols-2 sm:grid-cols-4",
  5: "grid-cols-5",
};

/**
 * 共用多维占比横条原语（心率区间、运动类别、肌群负荷分布）。
 * 分段之间留 2px 间隙防止相邻色块粘连，悬停某段时突出显示对应数值列。
 */
export function ProportionBar({
  segments,
  columns = 5,
  showGrid = true,
  ariaLabel = "分布占比",
  className,
}: ProportionBarProps) {
  const [activeKey, setActiveKey] = useState<string | null>(null);
  const nonEmpty = segments.filter((seg) => seg.pct > 0);

  return (
    <div className={cn("space-y-3", className)}>
      <div
        role="img"
        aria-label={ariaLabel}
        className="flex h-3 w-full gap-0.5 overflow-hidden rounded-full bg-surface-overlay"
      >
        {nonEmpty.map((seg) => (
          <div
            key={seg.key}
            style={{ width: `${seg.pct}%` }}
            onMouseEnter={() => setActiveKey(seg.key)}
            onMouseLeave={() => setActiveKey(null)}
            title={`${seg.label} ${seg.pct}%${seg.subLabel ? ` (${seg.subLabel})` : ""}`}
            className={cn(
              "h-full transition-opacity duration-150 first:rounded-l-full last:rounded-r-full",
              seg.colorClass,
              activeKey && activeKey !== seg.key ? "opacity-45" : "opacity-100",
            )}
          />
        ))}
      </div>

      {showGrid ? (
        <div className={cn("grid gap-1.5 text-center", GRID_COLUMNS[columns])}>
          {segments.map((seg) => {
            const focused = activeKey === seg.key;
            return (
              <div
                key={seg.key}
                onMouseEnter={() => setActiveKey(seg.key)}
                onMouseLeave={() => setActiveKey(null)}
                className={cn(
                  "rounded-lg px-1 py-1 transition-colors",
                  focused ? "bg-surface-overlay" : "",
                )}
              >
                <div className="num text-subheadline font-semibold tabular-nums text-text-primary">
                  {seg.pct}%
                </div>
                <div className="flex items-center justify-center gap-1 text-caption1 text-text-muted">
                  <span className={cn("size-1.5 shrink-0 rounded-full", seg.colorClass)} aria-hidden="true" />
                  <span className="truncate">{seg.label}</span>
                </div>
                {seg.subLabel ? (
                  <div className="num text-caption1 leading-tight tabular-nums text-text-muted">
                    {seg.subLabel}
                  </div>
                ) : null}
              </div>
            );
          })}
        </div>
      ) : null}
    </div>
  );
}
