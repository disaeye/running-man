"use client";

import type { MuscleVolumeItem } from "@shared/types/strength";
import { Badge } from "@shared/ui/Badge";

interface MuscleVolumeChartProps {
  data: MuscleVolumeItem[];
}

export function MuscleVolumeChart({ data }: MuscleVolumeChartProps) {
  const sorted = [...data].sort((a, b) => b.volume_kg - a.volume_kg);
  const maxVolume = sorted[0]?.volume_kg ?? 0;

  if (sorted.length === 0) {
    return (
      <div className="flex h-[200px] items-center justify-center text-subheadline text-text-muted">
        暂无肌群容量数据
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-3">
      {sorted.map((item) => {
        const pct = maxVolume > 0 ? (item.volume_kg / maxVolume) * 100 : 0;
        return (
          <div key={item.muscle} className="flex flex-col gap-1">
            <div className="flex items-center justify-between text-subheadline">
              <div className="flex items-center gap-2">
                <span className="font-medium text-text-primary">
                  {item.muscle}
                </span>
                <Badge variant="neutral">
                  {item.set_count} 组 · {item.exercise_count} 动作
                </Badge>
              </div>
              <span className="font-mono text-text-secondary">
                {formatKg(item.volume_kg)}
              </span>
            </div>
            <div className="h-2 w-full overflow-hidden rounded-full bg-surface-overlay">
              <div
                className="h-full rounded-full bg-gradient-to-r from-ctl to-atl-magenta transition-all duration-500"
                style={{ width: `${pct}%` }}
              />
            </div>
          </div>
        );
      })}
    </div>
  );
}

function formatKg(v: number): string {
  if (v >= 1000) return `${(v / 1000).toFixed(1)} t`;
  if (v >= 100) return `${Math.round(v)} kg`;
  return `${v.toFixed(1)} kg`;
}
