"use client";

import type { DistributionItem } from "@shared/types/strength";
import { Card } from "@shared/ui/Card";
import { ProportionBar } from "@shared/ui/ProportionBar";
import { largestRemainderPercent } from "@shared/lib/format";

interface MuscleDistributionProps {
  data: DistributionItem[];
}

const CATEGORY_COLORS: Record<string, string> = {
  胸: "bg-fatigue",
  背: "bg-fitness",
  腿: "bg-success",
  肩: "bg-warn",
  臂: "bg-z2",
  核心: "bg-form",
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

  const pcts = largestRemainderPercent(sorted.map((item) => item.volume_kg));

  return (
    <div className="space-y-3">
      <ProportionBar
        showGrid={false}
        ariaLabel="各肌群训练量占比"
        segments={sorted.map((item, idx) => ({
          key: item.category,
          label: item.category,
          pct: pcts[idx] ?? 0,
          colorClass: CATEGORY_COLORS[item.category] ?? "bg-text-muted",
          subLabel: `${item.set_count} 组`,
        }))}
      />
      <dl className="space-y-2.5" aria-label="各肌群训练量分布">
        {sorted.map((item) => (
          <div key={item.category} className="flex items-center justify-between gap-3 text-caption1">
            <dt className="flex min-w-0 items-center gap-2 font-medium text-text-primary">
              <span className={`inline-block size-2 shrink-0 rounded-full ${CATEGORY_COLORS[item.category] ?? "bg-text-muted"}`} aria-hidden="true" />
              <span className="truncate">{item.category}</span>
            </dt>
            <dd className="shrink-0 font-mono tabular-nums text-text-secondary">
              {item.set_count} 组 · {item.percentage.toFixed(0)}% · {Math.round(item.volume_kg).toLocaleString()} kg
            </dd>
          </div>
        ))}
      </dl>
    </div>
  );
}
