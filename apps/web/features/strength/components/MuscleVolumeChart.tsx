"use client";

import type { MuscleVolumeItem } from "@shared/types/strength";
import { Card } from "@shared/ui/Card";

interface MuscleVolumeChartProps {
  data: MuscleVolumeItem[];
}

export function MuscleVolumeChart({ data }: MuscleVolumeChartProps) {
  const sorted = [...data].sort((left, right) => right.volume_kg - left.volume_kg);
  const maxVolume = sorted[0]?.volume_kg ?? 0;

  if (sorted.length === 0) {
    return (
      <Card padding="md" className="flex min-h-40 items-center justify-center text-subheadline text-text-muted">
        暂无肌群训练量数据
      </Card>
    );
  }

  return (
    <dl className="space-y-3">
      {sorted.map((item) => {
        const width = maxVolume > 0 ? `${(item.volume_kg / maxVolume) * 100}%` : "0%";
        return (
          <div key={item.muscle} className="space-y-1">
            <div className="flex items-center justify-between gap-3 text-caption1">
              <dt className="truncate font-medium text-text-primary">{item.muscle}</dt>
              <dd className="shrink-0 font-mono tabular-nums text-text-secondary">
                {formatKg(item.volume_kg)}
              </dd>
            </div>
            <div
              className="h-2 w-full overflow-hidden rounded-full bg-surface-overlay"
              role="img"
              aria-label={`${item.muscle} ${formatKg(item.volume_kg)}`}
            >
              <div
                className="h-full rounded-full bg-sport-workout"
                style={{ width }}
              />
            </div>
          </div>
        );
      })}
    </dl>
  );
}

function formatKg(value: number): string {
  if (value >= 1000) return `${(value / 1000).toFixed(1)} t`;
  if (value >= 100) return `${Math.round(value)} kg`;
  return `${value.toFixed(1)} kg`;
}
