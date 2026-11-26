"use client";

import { useMemo, useState } from "react";
import type { StreamMap } from "@shared/types/activity";
import type { ActivityLap } from "@features/activity/hooks/useActivityLaps";
import { buildTimeline, splitByDistance, validSplitSampleTime } from "@features/activity/lib/splits";
import { fastestPaceIndex } from "@features/activity/components/SplitRow";
import { formatPaceFromSeconds } from "@shared/lib/format";
import { NO_VALUE } from "@shared/lib/use-data-state";

interface SplitItem {
  index: number;
  timeSec?: number | null;
  paceSec: number | null;
  avgHr: number | null;
  distanceKm: number;
  partial: boolean;
}

type SplitMode = "laps" | "km";

export function ActivityKmSplits({
  streams,
  laps = [],
  intervalSummary = [],
  onSelectTime,
}: {
  streams: StreamMap;
  laps?: readonly ActivityLap[];
  intervalSummary?: readonly string[];
  onSelectTime?: (timeSec: number) => void;
}) {
  const hasLaps = laps.length > 1;
  const lapsAreAutoKm =
    hasLaps && laps.every((lap) => lap.distance_m != null && Math.abs(lap.distance_m - 1000) <= 150);
  const [picked, setPicked] = useState<SplitMode | null>(null);
  const [expanded, setExpanded] = useState(false);
  const mode: SplitMode = picked ?? (hasLaps && !lapsAreAutoKm ? "laps" : "km");

  const timeline = useMemo(() => buildTimeline(streams), [streams]);
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

    return splitByDistance(timeline, 1000).map((row, index) => ({
      index: index + 1,
      timeSec: validSplitSampleTime(streams, row.startTime, row.endTime),
      paceSec: row.avgSpeed && row.avgSpeed > 0 ? 1000 / row.avgSpeed : null,
      avgHr: row.avgHr != null ? Math.round(row.avgHr) : null,
      distanceKm: row.distanceM / 1000,
      partial: row.distanceM < 999,
    }));
  }, [timeline, streams, laps, mode, hasLaps]);

  if (splits.length === 0) {
    return <p className="text-sm text-muted-foreground">暂无分段数据</p>;
  }

  const speeds = splits.map((s) => (s.paceSec && s.paceSec > 0 ? 1000 / s.paceSec : null));
  const distances = splits.map((s) => s.distanceKm * 1000);
  const bestIdx = fastestPaceIndex(
    speeds,
    mode === "km" ? { distances, strideM: 1000 } : undefined,
  );
  const fastestPace = bestIdx >= 0 ? (splits[bestIdx]?.paceSec ?? 0) : 0;

  let weightedDist = 0;
  let weightedSec = 0;
  for (const s of splits) {
    if (s.paceSec != null && s.paceSec > 0 && s.distanceKm > 0) {
      weightedDist += s.distanceKm;
      weightedSec += s.paceSec * s.distanceKm;
    }
  }
  const averagePace = weightedDist > 0 ? weightedSec / weightedDist : null;

  const canCollapse = splits.length > 12;
  const visibleSplits = canCollapse && !expanded
    ? [...splits.slice(0, 5), ...splits.slice(-3)]
    : splits;

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
                onClick={() => { setPicked(value); setExpanded(false); }}
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

      <div className="grid grid-cols-[2.25rem_minmax(0,1fr)_3.25rem_7.75rem] items-center gap-2 border-b border-border-subtle pb-1.5 text-caption1 text-text-muted">
        <span>{mode === "laps" && hasLaps ? "圈" : "分段"}</span>
        <span>配速对比</span>
        <span className="text-right">配速</span>
        <span className="text-right">心率 · 距离</span>
      </div>

      {visibleSplits.map((split, pos) => {
        const pace = split.paceSec;
        const origIdx = splits.indexOf(split);
        const isFastest = origIdx === bestIdx && pace != null;
        const fasterThanAverage = pace != null && averagePace != null && pace < averagePace;
        const barPct = pace && fastestPace ? Math.min(100, Math.max(15, (fastestPace / pace) * 100)) : 0;
        const showCollapseGap = canCollapse && !expanded && pos === 5;

        return (
          <div key={split.index} className="space-y-2">
            {showCollapseGap ? (
              <div className="py-1 text-center">
                <button
                  type="button"
                  onClick={() => setExpanded(true)}
                  className="min-h-11 rounded-full px-4 text-caption1 font-medium text-accent-strong hover:bg-secondary"
                >
                  展开全部 {splits.length} {mode === "laps" && hasLaps ? "圈" : "段"}（已折叠 {splits.length - 8} 段）
                </button>
              </div>
            ) : null}
            <button
              type="button"
              disabled={split.timeSec == null || !onSelectTime}
              aria-label={`查看第 ${split.index} 段运动流`}
              onClick={() => { if (split.timeSec != null) onSelectTime?.(split.timeSec); }}
              className={`focus-ring grid min-h-11 w-full grid-cols-[2.25rem_minmax(0,1fr)_3.25rem_7.75rem] items-center gap-2 rounded-lg px-1 text-left text-xs hover:bg-surface-active disabled:cursor-default ${
                isFastest ? "bg-surface-overlay" : ""
              }`}
            >
              <span className={`num flex items-center gap-1 font-mono tabular-nums ${isFastest ? "font-bold text-accent-strong" : "text-muted-foreground"}`}>
                <span>{split.index}</span>
                {isFastest ? <span className="size-1.5 rounded-full bg-accent-strong" title="最快分段" aria-label="最快" /> : null}
              </span>
              <div className="h-2 w-full overflow-hidden rounded-full bg-secondary">
                <div
                  className={`h-full rounded-full ${fasterThanAverage ? "bg-success" : "bg-warn"}`}
                  style={{ width: `${barPct}%` }}
                />
              </div>
              <span className={`num text-right font-mono font-medium tabular-nums ${isFastest ? "text-accent-strong" : "text-text-primary"}`}>
                {pace ? formatPaceFromSeconds(Math.round(pace)) : NO_VALUE}
              </span>
              <span className="num text-right font-mono tabular-nums text-muted-foreground">
                {split.avgHr != null ? `${split.avgHr} bpm` : NO_VALUE} ·{" "}
                <span className={split.partial ? "text-warn" : undefined}>{split.distanceKm.toFixed(2)} km</span>
              </span>
            </button>
          </div>
        );
      })}

      {canCollapse && expanded ? (
        <div className="pt-1 text-center">
          <button
            type="button"
            onClick={() => setExpanded(false)}
            className="min-h-11 rounded-full px-4 text-caption1 text-text-muted hover:bg-secondary hover:text-text-primary"
          >
            收起中间分段
          </button>
        </div>
      ) : null}
    </div>
  );
}
