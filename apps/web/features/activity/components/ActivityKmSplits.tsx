"use client";

import { useMemo, useState } from "react";
import type { StreamMap } from "@shared/types/activity";
import type { ActivityLap } from "@features/activity/hooks/useActivityLaps";
import { buildTimeline, splitByDistance } from "@features/activity/lib/splits";
import { formatPaceFromSeconds } from "@shared/lib/format";
import { NO_VALUE } from "@shared/lib/use-data-state";

interface SplitItem {
  index: number;
  paceSec: number | null;
  avgHr: number | null;
  distanceKm: number;
  /** 尾段不足一个完整单位 */
  partial: boolean;
}

type SplitMode = "laps" | "km";

/**
 * 分段表。
 *
 * 「按圈」用来源记录的圈：间歇训练的工作段与组间休息都在里面，圈距由来源决定
 * （操场 400 米、路跑 1 公里、或 N × 1 公里配 200 米休息）。
 * 「每公里」按累计距离插值切分，整公里行就是 1.00 km，最后一行是真实剩余距离。
 */
export function ActivityKmSplits({
  streams,
  laps = [],
  intervalSummary = [],
}: {
  streams: StreamMap;
  laps?: readonly ActivityLap[];
  /** 来源自己写的分组摘要，例如「21× 88s 164bpm」 */
  intervalSummary?: readonly string[];
}) {
  const hasLaps = laps.length > 1;
  // 圈要等接口回来，默认值不能在建 state 时就定下。
  // 来源的圈都是 1 公里上下的自动圈时，「按圈」与「每公里」是同一件事，只是圈距
  // 会抖几十米，所以那种情况默认看整齐的每公里；其余（400/200 米这种）默认看圈。
  const lapsAreAutoKm =
    hasLaps && laps.every((lap) => lap.distance_m != null && Math.abs(lap.distance_m - 1000) <= 150);
  const [picked, setPicked] = useState<SplitMode | null>(null);
  const mode: SplitMode = picked ?? (hasLaps && !lapsAreAutoKm ? "laps" : "km");

  const splits = useMemo<SplitItem[]>(() => {
    if (mode === "laps" && hasLaps) {
      return laps.map((lap) => ({
        index: lap.lap_index + 1,
        paceSec: lap.avg_pace && lap.avg_pace > 0 ? lap.avg_pace : null,
        avgHr: lap.avg_hr != null ? Math.round(lap.avg_hr) : null,
        distanceKm: (lap.distance_m ?? 0) / 1000,
        partial: false,
      }));
    }

    return splitByDistance(buildTimeline(streams), 1000).map((row, index) => ({
      index: index + 1,
      paceSec: row.avgSpeed && row.avgSpeed > 0 ? 1000 / row.avgSpeed : null,
      avgHr: row.avgHr != null ? Math.round(row.avgHr) : null,
      distanceKm: row.distanceM / 1000,
      partial: row.distanceM < 999,
    }));
  }, [streams, laps, mode, hasLaps]);

  if (splits.length === 0) {
    return <p className="text-sm text-muted-foreground">暂无分段数据</p>;
  }

  const validPaces = splits.map((s) => s.paceSec).filter((p): p is number => p != null && p > 0);
  const fastestPace = validPaces.length ? Math.min(...validPaces) : 0;
  const averagePace = validPaces.length
    ? validPaces.reduce((a, b) => a + b, 0) / validPaces.length
    : null;

  return (
    <div className="space-y-2" data-testid="activity-splits">
      <div className="flex flex-wrap items-center justify-between gap-2 text-caption1 text-muted-foreground">
        {hasLaps ? (
          <div className="flex rounded-full bg-secondary p-1" role="tablist">
            {([["laps", "按圈"], ["km", "每公里"]] as const).map(([value, label]) => (
              <button
                key={value}
                type="button"
                role="tab"
                aria-selected={mode === value}
                onClick={() => setPicked(value)}
                className={`inline-flex min-h-11 items-center rounded-full px-3 text-xs font-medium ${
                  mode === value ? "bg-primary text-primary-foreground" : "text-muted-foreground"
                }`}
              >
                {label}
              </button>
            ))}
          </div>
        ) : (
          <span>每公里</span>
        )}
        <span className="num">
          {splits.length} {mode === "laps" && hasLaps ? "圈" : "段"} · 均配速{" "}
          {averagePace ? formatPaceFromSeconds(Math.round(averagePace)) : NO_VALUE}
        </span>
      </div>

      {mode === "laps" && intervalSummary.length > 0 ? (
        <p className="text-caption1 text-muted-foreground">来源分组：{intervalSummary.join("、")}</p>
      ) : null}

      {splits.length > 2 ? (
        <p className="text-caption1 text-muted-foreground">条越长越快；快于全程平均的段用绿色，慢于平均的用橙色。</p>
      ) : null}

      {splits.map((split) => {
        const pace = split.paceSec;
        const isFastest = pace != null && pace === fastestPace;
        const fasterThanAverage = pace != null && averagePace != null && pace < averagePace;
        const barPct = pace && fastestPace ? Math.min(100, Math.max(15, (fastestPace / pace) * 100)) : 0;

        return (
          <div key={split.index} className="grid grid-cols-[26px_1fr_auto] items-center gap-2 text-xs">
            <span className={`num ${isFastest ? "font-semibold text-accent-strong" : "text-muted-foreground"}`}>
              {split.index}
            </span>
            <div className="flex items-center gap-2">
              <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-secondary">
                <div
                  className={`h-full ${fasterThanAverage ? "bg-fitness" : "bg-warn"}`}
                  style={{ width: `${barPct}%` }}
                />
              </div>
              <span className="num font-medium">{pace ? formatPaceFromSeconds(Math.round(pace)) : NO_VALUE}</span>
            </div>
            <span className="num text-right text-muted-foreground">
              {split.avgHr != null ? `${split.avgHr} bpm` : NO_VALUE} ·{" "}
              <span className={split.partial ? "text-warn" : undefined}>{split.distanceKm.toFixed(2)} km</span>
            </span>
          </div>
        );
      })}
    </div>
  );
}
