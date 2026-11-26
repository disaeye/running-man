"use client";

import { PageCard } from "@shared/ui/Card";
import { Bar } from "@shared/ui/MetricBar";
import type { MuscleVolumeItem } from "@shared/types/strength";

interface StrengthMuscleLoadProps {
  data: readonly MuscleVolumeItem[];
}

export function StrengthMuscleLoad({ data }: StrengthMuscleLoadProps) {
  const maxVolume = Math.max(1, ...data.map((item) => item.volume_kg));

  return (
    <PageCard title="近 4 周肌群训练量">
      {data.length === 0 ? (
        <p className="py-2 text-sm text-muted-foreground">
          还没有组次记录，完成训练后将按肌群汇总负荷。
        </p>
      ) : (
        <div className="space-y-3">
          {data.map((item) => (
            <div key={item.muscle} className="flex items-center gap-3 text-sm">
              <span className="w-16 shrink-0 truncate text-muted-foreground">{item.muscle}</span>
              <div className="min-w-0 flex-1">
                <Bar value={item.volume_kg} max={maxVolume} />
              </div>
              <span className="num w-16 shrink-0 text-right text-xs tabular-nums">
                {item.volume_kg.toFixed(0)} kg
              </span>
            </div>
          ))}
        </div>
      )}
    </PageCard>
  );
}
