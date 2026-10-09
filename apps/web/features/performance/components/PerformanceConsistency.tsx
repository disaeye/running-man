"use client";

import useSWR from "swr";
import { useMemo } from "react";
import { Card } from "@shared/ui/Card";
import { EmptyState } from "@shared/ui/EmptyState";
import { Badge } from "@shared/ui/Badge";
import { computeRange } from "@shared/lib/format";
import { callOrvalValidated } from "@shared/api/orval-adapter";
import { listActivitiesApiV1ActivitiesGet } from "@shared/api/generated/clients";
import * as Generated from "@shared/api/generated/model";
import { z } from "zod";
import { LOADING_LABEL } from "@shared/lib/use-data-state";

const DAY_LABELS = ["一", "二", "三", "四", "五", "六", "日"];
const MONTH_LABELS = [
  "1月", "2月", "3月", "4月", "5月", "6月",
  "7月", "8月", "9月", "10月", "11月", "12月",
];

/** Consistency cell data: 0=no training day, 1=training day */
interface ConsistencyCell {
  /** ISO date key: YYYY-MM-DD */
  date: string;
  /** Number of activities that day */
  count: number;
}

type BadgeVariant = "success" | "warning" | "error" | "info" | "neutral";

function countsFromActivities(
  activities: readonly Generated.ActivitySummaryOutput[],
): ConsistencyCell[] {
  const counts = new Map<string, number>();
  for (const activity of activities) {
    const date = activity.start_time.slice(0, 10);
    counts.set(date, (counts.get(date) ?? 0) + 1);
  }
  return Array.from(counts.entries())
    .map(([date, count]) => ({ date, count }))
    .sort((a, b) => a.date.localeCompare(b.date));
}

async function fetchConsistencyData(): Promise<ConsistencyCell[]> {
  // 52-week heatmap derives from logged activities; there is no dedicated
  // consistency endpoint (the previous phantom /insights/training-consistency
  // call 404'd on every load).
  const range = computeRange(365);
  const activities = await callOrvalValidated(
    (f) => listActivitiesApiV1ActivitiesGet({ from: range.from, to: range.to }, {}, f),
    z.array(Generated.ActivitySummary),
  );
  return countsFromActivities(activities);
}

/**
 * Tab 4: 训练一致性
 * 52-week heatmap showing which days had training activity.
 */
export function PerformanceConsistency() {
  // The key names a cache entry, not a URL — `fetchConsistencyData` reads
  // activities. It is not spelled like an endpoint because it is not one;
  // naming it after the deleted phantom endpoint made it read as a live call.
  const { data: trainingDays, error, isLoading } = useSWR<ConsistencyCell[]>(
    ["training-consistency-from-activities"],
    { fetcher: fetchConsistencyData, shouldRetryOnError: false },
  );

  const { weeks, totalDays, streak, weeklyConsistency } = useMemo(() => {
    const cells = trainingDays ?? [];
    if (cells.length === 0) {
      return { weeks: [] as ConsistencyCell[][], totalDays: 0, streak: 0, weeklyConsistency: 0 };
    }

    const sorted = [...cells].sort((a, b) => a.date.localeCompare(b.date));
    const totalDays = sorted.reduce((s, c) => s + (c.count > 0 ? 1 : 0), 0);

    // Current streak: count consecutive days from most recent
    let streak = 0;
    for (let i = sorted.length - 1; i >= 0; i--) {
      const cell = sorted[i]!;
      if (cell.count > 0) {
        streak++;
      } else {
        break;
      }
    }

    // Build weeks grid: 52 weeks × 7 days
    const today = new Date();
    const weeks: ConsistencyCell[][] = [];
    const lookup = new Map(sorted.map((c) => [c.date, c]));

    // Start from 52 weeks ago Monday
    const start = new Date(today);
    start.setDate(start.getDate() - 364);
    const dowStart = start.getDay(); // 0=Sun
    const mondayOffset = dowStart === 0 ? -6 : 1 - dowStart;
    start.setDate(start.getDate() + mondayOffset);

    for (let w = 0; w < 52; w++) {
      const week: ConsistencyCell[] = [];
      for (let d = 0; d < 7; d++) {
        const date = new Date(start);
        date.setDate(start.getDate() + w * 7 + d);
        const iso = date.toISOString().slice(0, 10);
        week.push(lookup.get(iso) ?? { date: iso, count: 0 });
      }
      weeks.push(week);
    }

    // Weekly consistency: % of weeks with ≥3 training days
    const trainedWeeks = weeks.filter((week) => week.filter((c) => c.count > 0).length >= 3).length;
    const weeklyConsistency = Math.round((trainedWeeks / weeks.length) * 100);

    return { weeks, totalDays, streak, weeklyConsistency };
  }, [trainingDays]);

  if (isLoading) {
    return (
      <div className="flex h-64 items-center justify-center text-subheadline text-text-muted">
        {LOADING_LABEL}
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex h-64 items-center justify-center text-subheadline text-error">
        {error instanceof Error ? error.message : error}
      </div>
    );
  }

  if ((trainingDays ?? []).length === 0) {
    return (
      <EmptyState
        title="暂无训练一致性数据"
        description="系统会追踪你每日的训练情况，以热力图呈现训练频率"
      />
    );
  }

  const variant: BadgeVariant = weeklyConsistency >= 80 ? "success" : weeklyConsistency >= 50 ? "warning" : "error";

  return (
    <div className="flex flex-col gap-6">
      {/* Summary Stats */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <Card padding="sm">
          <p className="text-caption1 font-medium text-text-secondary">总训练天数</p>
          <p className="mt-1 font-mono text-title1 font-bold text-text-primary">{totalDays}</p>
        </Card>
        <Card padding="sm">
          <p className="text-caption1 font-medium text-text-secondary">当前连续训练</p>
          <p className="mt-1 font-mono text-title1 font-bold text-success">{streak} 天</p>
        </Card>
        <Card padding="sm">
          <p className="text-caption1 font-medium text-text-secondary">周一致性</p>
          <div className="mt-1 flex items-center gap-2">
            <p className="font-mono text-title1 font-bold text-text-primary">{weeklyConsistency}%</p>
            <Badge variant={variant}>{weeklyConsistency >= 80 ? "优秀" : weeklyConsistency >= 50 ? "一般" : "偏低"}</Badge>
          </div>
        </Card>
      </div>

      {/* Month Labels */}
      <div className="overflow-x-auto">
        <div className="flex gap-1 pl-8">
          {MONTH_LABELS.map((m) => (
            <span key={m} className="w-10 text-caption1 text-text-muted">
              {m}
            </span>
          ))}
        </div>

        <div className="mt-2 flex gap-1">
          {/* Day labels */}
          <div className="flex flex-col gap-1 pr-2">
            {DAY_LABELS.map((label, i) => (
              <span key={i} className="flex h-3 w-6 items-center text-caption1 text-text-muted">
                {i % 2 === 0 ? label : ""}
              </span>
            ))}
          </div>

          {/* Heatmap grid */}
          {weeks.map((week, wIdx) => (
            <div key={wIdx} className="flex flex-col gap-1">
              {week.map((cell, dIdx) => {
                const intensity = cell.count === 0 ? "bg-surface-overlay" : cell.count >= 2 ? "bg-accent/20" : "bg-accent/10";
                return (
                  <div
                    key={dIdx}
                    className={`h-3 w-3 rounded-sm ${intensity} transition-colors hover:ring-1 hover:ring-border-strong`}
                    title={`${cell.date}: ${cell.count > 0 ? `${cell.count} 次训练` : "休息"}`}
                  />
                );
              })}
            </div>
          ))}
        </div>

        {/* Legend */}
        <div className="mt-3 flex items-center gap-2 text-caption1 text-text-muted">
          <span>少</span>
          <div className="h-3 w-3 rounded-sm bg-surface-overlay" />
          <div className="h-3 w-3 rounded-sm bg-accent/10" />
          <div className="h-3 w-3 rounded-sm bg-accent/20" />
          <span>多</span>
        </div>
      </div>
    </div>
  );
}
