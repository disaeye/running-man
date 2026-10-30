"use client";

// 跑量与训练安排：只展示训练次数、跑步距离及真实计划目标。

import { Card } from "@shared/ui/Card";
import { ChartShell } from "@shared/ui/ChartShell";
import { EmptyState } from "@shared/ui/EmptyState";
import { useWeeklyProgress } from "@features/today/hooks/useWeeklyProgress";
import { useAnalysisRange } from "../lib/analysis-range";

export function AnalysisLoad() {
  const { range } = useAnalysisRange();
  const { weeks, loading, error } = useWeeklyProgress(range.from, range.to);
  const hasRunningData = weeks.some((week) => week.actual_distance_m > 0 || week.actual_sessions > 0);

  return (
    <div className="flex flex-col gap-4" data-testid="analysis-load-root">
      <ChartShell title="每周跑量" subtitle="跑步距离与训练次数" provenance={`${range.from} → ${range.to}`}>
        {error ? (
          <p role="alert" className="text-caption1 text-error">{error}</p>
        ) : loading && weeks.length === 0 ? (
          <p className="py-12 text-center text-caption1 text-text-muted">正在读取训练记录…</p>
        ) : hasRunningData ? (
          <div className="space-y-3" data-testid="running-volume-weeks">
            {weeks.map((week) => (
              <div key={week.week} className="grid grid-cols-[5.5rem_1fr] items-center gap-3" data-testid="running-volume-week">
                <span className="text-caption1 text-text-muted">{week.week}</span>
                <div className="min-w-0">
                  <div className="h-2 overflow-hidden rounded-full bg-surface-sunken" aria-label={`${week.week} 跑量`}>
                    <div className="h-full rounded-full bg-accent" style={{ width: `${distanceWidth(week.actual_distance_m, weeks)}%` }} />
                  </div>
                  <p className="mt-1 text-right font-mono text-caption1 tabular-nums text-text-primary">{formatDistance(week.actual_distance_m)} · {week.actual_sessions} 次</p>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <EmptyState title="暂无跑步记录" description="选择其他日期范围，或同步包含跑步距离的活动后查看每周跑量。" />
        )}
      </ChartShell>

      <Card padding="md" data-testid="running-plan-summary">
        <h2 className="text-subheadline font-semibold text-text-primary">训练安排</h2>
        <p className="mt-2 text-caption1 text-text-secondary">
          {weeks.length > 0
            ? `当前日期范围内记录了 ${weeks.reduce((sum, week) => sum + week.actual_sessions, 0)} 次跑步训练，累计 ${formatDistance(weeks.reduce((sum, week) => sum + week.actual_distance_m, 0))}。`
            : "当前日期范围没有可用的训练汇总。"}
        </p>
        {weeks.some((week) => week.planned_distance_m > 0) && (
          <p className="mt-1 text-caption1 text-text-muted">
            计划跑量 {formatDistance(weeks.reduce((sum, week) => sum + week.planned_distance_m, 0))} · 实际跑量 {formatDistance(weeks.reduce((sum, week) => sum + week.actual_distance_m, 0))}
          </p>
        )}
      </Card>
    </div>
  );
}

function formatDistance(meters: number): string {
  return `${(meters / 1000).toFixed(1)} km`;
}

function distanceWidth(distance: number, weeks: readonly { actual_distance_m: number }[]): number {
  const maximum = Math.max(...weeks.map((week) => week.actual_distance_m), 1);
  return Math.max(3, Math.round((distance / maximum) * 100));
}
