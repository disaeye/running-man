"use client";

import { useMemo, useState } from "react";
import { ChevronDown, ChevronUp } from "lucide-react";
import { Card } from "@shared/ui/Card";
import {
  formatDistance,
  formatDuration,
  formatPace,
  formatElevation,
  formatCalories,
  formatHeartRate,
} from "@shared/lib/format";
import type { ActivitySummary } from "@shared/types/activity";

interface ActivityTotalsProps {
  activities: ActivitySummary[];
}

interface TotalStat {
  readonly label: string;
  readonly value: string;
}

interface TotalsSummary {
  readonly count: number;
  readonly distance: string;
  readonly duration: string;
  readonly tss: string;
  readonly stats: readonly TotalStat[];
}

function buildSummary(activities: ActivitySummary[]): TotalsSummary {
  if (activities.length === 0) {
    return {
      count: 0,
      distance: "--",
      duration: "--",
      tss: "--",
      stats: [
        { label: "活动数", value: "0" },
        { label: "总距离", value: "--" },
        { label: "总时长", value: "--" },
        { label: "总训练压力", value: "--" },
        { label: "平均心率", value: "--" },
        { label: "平均配速", value: "--" },
        { label: "累计爬升", value: "--" },
        { label: "总卡路里", value: "--" },
      ],
    };
  }

  const totalDistance = activities.reduce((s, a) => s + (a.distance_m ?? 0), 0);
  const totalDuration = activities.reduce((s, a) => s + (a.duration_s ?? 0), 0);
  const totalTss = activities.reduce((s, a) => s + (a.tss ?? 0), 0);
  const totalElev = activities.reduce(
    (s, a) => s + (a.elevation_gain_m ?? 0),
    0,
  );
  const totalCal = activities.reduce((s, a) => s + (a.calories ?? 0), 0);

  const hrItems = activities.filter((a) => a.avg_hr != null);
  const avgHr =
    hrItems.length > 0
      ? hrItems.reduce((s, a) => s + (a.avg_hr ?? 0), 0) / hrItems.length
      : null;

  const paceItems = activities.filter(
    (a) => a.avg_speed != null && a.avg_speed > 0,
  );
  const avgPace =
    paceItems.length > 0
      ? paceItems.reduce((s, a) => s + (a.avg_speed ?? 0), 0) / paceItems.length
      : null;

  const tssLabel = totalTss > 0 ? `${Math.round(totalTss)}` : "--";

  return {
    count: activities.length,
    distance: formatDistance(totalDistance),
    duration: formatDuration(totalDuration),
    tss: tssLabel,
    stats: [
      { label: "活动数", value: `${activities.length}` },
      { label: "总距离", value: formatDistance(totalDistance) },
      { label: "总时长", value: formatDuration(totalDuration) },
      { label: "总训练压力", value: tssLabel },
      { label: "平均心率", value: formatHeartRate(avgHr) },
      { label: "平均配速", value: formatPace(avgPace) },
      {
        label: "累计爬升",
        value: formatElevation(totalElev > 0 ? totalElev : null),
      },
      {
        label: "总卡路里",
        value: formatCalories(totalCal > 0 ? totalCal : null),
      },
    ],
  };
}

/**
 * Browse-density summary: one line by default; expand for full KPI grid.
 */
export function ActivityTotals({ activities }: ActivityTotalsProps) {
  const [expanded, setExpanded] = useState(false);
  const summary = useMemo(() => buildSummary(activities), [activities]);

  return (
    <section data-testid="activity-totals" aria-label="活动汇总">
      <button
        type="button"
        onClick={() => setExpanded((v) => !v)}
        className="focus-ring flex min-h-[56px] w-full items-center justify-between gap-4 rounded-2xl border border-border-default bg-surface-card px-4 py-3 text-left transition-colors hover:bg-surface-overlay sm:px-5"
        aria-expanded={expanded}
        data-testid="activity-totals-summary"
      >
        <div className="min-w-0">
          <p className="text-caption1 font-medium uppercase tracking-wider text-text-muted">
            当前筛选汇总
          </p>
          <p className="mt-1 truncate text-subheadline text-text-secondary">
            <span className="font-mono font-semibold tabular-nums text-text-primary">
              {summary.count}
            </span>
            <span className="text-text-muted"> 次</span>
            <span className="mx-2 text-text-muted">·</span>
            <span className="font-mono tabular-nums text-text-primary">
              {summary.distance}
            </span>
            <span className="mx-2 text-text-muted">·</span>
            <span className="font-mono tabular-nums text-text-primary">
              {summary.duration}
            </span>
            <span className="mx-2 text-text-muted">·</span>
            <span className="text-text-muted">TSS </span>
            <span className="font-mono tabular-nums text-text-primary">
              {summary.tss}
            </span>
          </p>
        </div>
        <span className="flex shrink-0 items-center gap-1 text-caption1 text-text-muted">
          {expanded ? "收起" : "明细"}
          {expanded ? (
            <ChevronUp className="h-4 w-4" aria-hidden />
          ) : (
            <ChevronDown className="h-4 w-4" aria-hidden />
          )}
        </span>
      </button>

      {expanded && (
        <div
          className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-4 lg:grid-cols-8"
          data-testid="activity-totals-grid"
        >
          {summary.stats.map((stat) => (
            <Card key={stat.label} padding="sm" className="text-center">
              <p className="text-caption2 font-medium uppercase tracking-wider text-text-muted">
                {stat.label}
              </p>
              <p className="mt-0.5 font-mono text-subheadline font-bold tabular-nums text-text-primary">
                {stat.value}
              </p>
            </Card>
          ))}
        </div>
      )}
    </section>
  );
}
