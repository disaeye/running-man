"use client";

import { computeRange } from "@shared/lib/format";

export type RangeKey = "1M" | "3M" | "6M" | "1Y" | "All";

interface RangeSelectorProps {
  activeRange: RangeKey;
  onRangeChange: (from: string, to: string, key: RangeKey) => void;
}

const RANGES: { key: RangeKey; label: string; days: number | null }[] = [
  { key: "1M", label: "1月", days: 30 },
  { key: "3M", label: "3月", days: 90 },
  { key: "6M", label: "6月", days: 180 },
  { key: "1Y", label: "1年", days: 365 },
  { key: "All", label: "全部", days: null },
];

export { computeRange };

export function RangeSelector({ activeRange, onRangeChange }: RangeSelectorProps) {
  return (
    <div
      className="inline-flex items-center gap-0.5 rounded-lg bg-surface-overlay p-0.5"
      role="group"
      aria-label="时间范围"
    >
      {RANGES.map(({ key, label, days }) => {
        const isActive = activeRange === key;
        return (
          <button
            key={key}
            type="button"
            onClick={() => {
              if (days != null) {
                const { from, to } = computeRange(days);
                onRangeChange(from, to, key);
              } else {
                // "All" — use a very large window (10 years)
                const { from, to } = computeRange(3650);
                onRangeChange(from, to, key);
              }
            }}
            className={`focus-ring inline-flex min-h-[44px] items-center rounded-md px-3 text-caption1 font-medium transition-colors ${
              isActive
                ? "bg-surface-card text-text-primary shadow-sm"
                : "text-text-muted hover:text-text-secondary"
            }`}
            aria-pressed={isActive}
          >
            {label}
          </button>
        );
      })}
    </div>
  );
}
