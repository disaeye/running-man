"use client";

import type { DistributionItem } from "@shared/types/strength";

interface MuscleDistributionProps {
  data: DistributionItem[];
}

const CATEGORY_COLORS: Record<string, string> = {
  胸: "from-atl-magenta to-atl-magenta/70",
  背: "from-ctl to-ctl/70",
  腿: "from-success to-success/70",
  肩: "from-warning to-warning/70",
  臂: "from-info to-info/70",
  核心: "from-tsb to-tsb/70",
  全身: "from-text-secondary to-text-secondary/60",
};

export function MuscleDistribution({ data }: MuscleDistributionProps) {
  const sorted = [...data].sort((a, b) => b.volume_kg - a.volume_kg);
  const total = sorted.reduce((sum, d) => sum + d.volume_kg, 0);

  if (sorted.length === 0 || total === 0) {
    return (
      <div className="flex h-[200px] items-center justify-center text-subheadline text-text-muted">
        暂无分布数据
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      {/* Stacked bar (100%) */}
      <div className="flex h-6 w-full overflow-hidden rounded-full bg-surface-overlay">
        {sorted.map((item) => {
          const width = (item.volume_kg / total) * 100;
          const gradient = CATEGORY_COLORS[item.category] ?? "from-text-muted to-text-muted/60";
          return (
            <div
              key={item.category}
              className={`h-full bg-gradient-to-r ${gradient} transition-all duration-500`}
              style={{ width: `${width}%` }}
              title={`${item.category}: ${item.volume_kg.toFixed(1)} kg (${item.percentage.toFixed(0)}%)`}
            />
          );
        })}
      </div>

      {/* Legend with bars */}
      <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
        {sorted.map((item) => {
          const gradient = CATEGORY_COLORS[item.category] ?? "from-text-muted to-text-muted/60";
          return (
            <div
              key={item.category}
              className="flex items-center gap-2 rounded-md border border-border-subtle bg-surface-raised px-3 py-2"
            >
              <div
                className={`h-3 w-3 rounded-full bg-gradient-to-br ${gradient}`}
              />
              <span className="flex-1 text-subheadline font-medium text-text-primary">
                {item.category}
              </span>
              <span className="text-caption1 text-text-muted">
                {item.percentage.toFixed(0)}%
              </span>
              <span className="font-mono text-caption1 text-text-secondary">
                {item.volume_kg.toFixed(0)} kg
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}
