"use client";

import { Card } from "@shared/ui/Card";
import { NO_VALUE } from "@shared/lib/use-data-state";
import { formatPaceFromSeconds } from "@shared/lib/format";

/**
 * 生涯个人最好成绩（参考稿的 PB 荣誉墙）。
 *
 * 四个距离各占一格：全马、半马、10 公里、5 公里。每格写最好用时、
 * 比赛名称与日期、平均配速。
 *
 * 成绩分两个来源，格子上写清楚是哪一个：
 *   · 比赛成绩是录入的实测成绩（``race_results`` 表）。
 *   · 训练最佳是按均速外推的最好成绩（``/insights/personal-records``）。
 * 两者不能混在一起说——外推的成绩不是比赛成绩，页面上会标出「训练最佳」。
 */

interface RaceResult {
  readonly event_name: string;
  readonly distance_category: string;
  readonly time_s: number;
  readonly race_date: string;
}

interface PersonalRecord {
  readonly type: string;
  readonly value_formatted: string;
  readonly date: string;
}

interface Props {
  readonly raceResults: readonly RaceResult[];
  readonly personalRecords: readonly PersonalRecord[];
  readonly testId?: string;
}

const DISTANCE_CELLS = [
  { label: "全程马拉松 42.195K", category: "marathon", recordType: "fastest_42195m" },
  { label: "半程马拉松 21.097K", category: "half", recordType: "fastest_21097m" },
  { label: "10 公里", category: "10k", recordType: "fastest_10000m" },
  { label: "5 公里", category: "5k", recordType: "fastest_5000m" },
] as const;

export function DemoRecordsWall({
  raceResults,
  personalRecords,
  testId,
}: Props) {
  return (
    <Card data-testid={testId ?? "demo-records-wall"}>
      <h2 className="text-title3 font-semibold text-text-primary">个人最好成绩</h2>

      <div className="mt-4 grid grid-cols-2 gap-3">
        {DISTANCE_CELLS.map((cell) => {
          const race = raceResults.find((row) => row.distance_category === cell.category);
          const record = personalRecords.find((row) => row.type === cell.recordType);
          return (
            <div
              key={cell.category}
              className="flex flex-col justify-between rounded-lg bg-surface-overlay px-3 py-2.5"
              data-testid={`demo-record-${cell.category}`}
            >
              <p className="text-caption1 uppercase tracking-wider text-text-muted">
                {cell.label}
              </p>
              {race ? (
                <>
                  <p className="mt-1 font-mono text-title2 font-bold tabular-nums text-text-primary">
                    {formatRaceTime(race.time_s)}
                  </p>
                  <p className="mt-1 truncate text-caption1 text-text-muted">
                    {race.event_name}
                  </p>
                  <p className="mt-0.5 font-mono text-caption1 text-accent">
                    {formatPaceFromSeconds(Math.round(race.time_s / (raceDistanceM(cell.category) / 1000)))}
                    /km · {race.race_date}
                  </p>
                </>
              ) : record ? (
                <>
                  <p className="mt-1 font-mono text-title2 font-bold tabular-nums text-text-secondary">
                    {record.value_formatted}
                  </p>
                  <p className="mt-1 truncate text-caption1 text-text-muted">训练最佳</p>
                  <p className="mt-0.5 font-mono text-caption1 text-text-muted">
                    {record.date}
                  </p>
                </>
              ) : (
                <>
                  <p className="mt-1 text-caption1 text-text-muted">{NO_VALUE}</p>
                  <p className="mt-1 text-caption1 text-text-muted">这个距离还没有成绩</p>
                </>
              )}
            </div>
          );
        })}
      </div>

      <p className="mt-3 text-caption1 text-text-muted">
        比赛成绩是录入的实测成绩；训练最佳按均速外推，不是比赛成绩。
      </p>
    </Card>
  );
}

/** 比赛用时：小时:分:秒 或 分:秒。 */
function formatRaceTime(seconds: number): string {
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const rest = Math.round(seconds % 60);
  if (hours > 0) {
    return `${hours}:${minutes.toString().padStart(2, "0")}:${rest.toString().padStart(2, "0")}`;
  }
  return `${minutes}:${rest.toString().padStart(2, "0")}`;
}

/** 标准比赛距离（米）。 */
function raceDistanceM(category: string): number {
  switch (category) {
    case "marathon":
      return 42195;
    case "half":
      return 21097;
    case "10k":
      return 10000;
    default:
      return 5000;
  }
}
