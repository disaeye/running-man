"use client";

import type { DistributionItem } from "@shared/types/strength";
import { Card } from "@shared/ui/Card";

interface MuscleDistributionProps {
  data: DistributionItem[];
}

const CATEGORY_COLORS: Record<string, string> = {
  胸: "bg-atl-magenta",
  背: "bg-ctl",
  腿: "bg-success",
  肩: "bg-warning",
  臂: "bg-info",
  核心: "bg-tsb",
  全身: "bg-text-secondary",
};

export function MuscleDistribution({ data }: MuscleDistributionProps) {
  const sorted = [...data].sort((left, right) => right.volume_kg - left.volume_kg);
  const totalVolume = sorted.reduce((sum, item) => sum + item.volume_kg, 0);

  if (sorted.length === 0 || totalVolume === 0) {
    return (
      <Card padding="md" className="flex min-h-40 items-center justify-center text-subheadline text-text-muted">
        暂无肌群训练分布数据
      </Card>
    );
  }

  return (
    <dl className="space-y-3" aria-label="各肌群训练量分布">
      {sorted.map((item) => (
        <div key={item.category} className="space-y-1">
          <div className="flex items-center justify-between gap-3 text-caption1">
            <dt className="truncate font-medium text-text-primary">{item.category}</dt>
            <dd className="shrink-0 font-mono tabular-nums text-text-secondary">
              {item.set_count} 组 · {item.percentage.toFixed(0)}% · {Math.round(item.volume_kg).toLocaleString()} kg
            </dd>
          </div>
          <div
            className="h-2 w-full overflow-hidden rounded-full bg-surface-overlay"
            role="img"
            aria-label={`${item.category}，${item.set_count} 组，占训练量 ${item.percentage.toFixed(0)}%`}
          >
            <div
              className={`h-full rounded-full ${CATEGORY_COLORS[item.category] ?? "bg-text-muted"}`}
              style={{ width: `${Math.min(100, Math.max(0, item.percentage))}%` }}
            />
          </div>
        </div>
      ))}
    </dl>
  );
}
