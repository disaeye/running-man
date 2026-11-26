"use client";

import { PageCard } from "@shared/ui/Card";
import { LovableChart } from "@shared/ui/LovableChart";
import { useWeeklyProgress } from "@features/today/hooks/useWeeklyProgress";

/** 周跑量对比：训练负荷的一部分，归在「负荷与恢复」下。 */
export function WeeklyDistanceCard({ from, to }: { readonly from: string; readonly to: string }) {
  const weekly = useWeeklyProgress(from, to);
  if (weekly.weeks.length === 0) return null;
  return (
    <PageCard title="周跑量对比">
      <LovableChart
        h={90}
        zero
        labels={weekly.weeks.map((week) => week.week.slice(5))}
        bars={{
          data: weekly.weeks.map((week) => week.actual_distance_m / 1000),
          cls: "fill-fitness/55",
          label: "周跑量",
          format: (value) => `${value.toFixed(1)} km`,
        }}
      />
    </PageCard>
  );
}
