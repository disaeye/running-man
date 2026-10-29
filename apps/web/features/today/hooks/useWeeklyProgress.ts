"use client";

import useSWR from "swr";
import { athleteWeekRange, useAthleteTimezone } from "@shared/lib/training-day";
import { callOrvalValidated } from "@shared/api/orval-adapter";
import { getWeeklyProgressApiV1InsightsWeeklyProgressGet } from "@shared/api/generated/clients";
import * as Generated from "@shared/api/generated/model";
import { z } from "zod";

export interface WeekProgress {
  week: string;
  planned_tss: number;
  actual_tss: number;
  planned_sessions: number;
  actual_sessions: number;
  completion_pct: number | string;
  planned_distance_m: number;
  actual_distance_m: number;
  /** 实际累计爬升（米）。 */
  actual_elevation_m: number;
  /** 平均配速（秒/公里）；没有距离时为 null。 */
  avg_pace_s_per_km: number | null;
  /** 距离目标之差（米）：正数表示还差多少。 */
  remaining_distance_m: number;
}

interface UseWeeklyProgressResult {
  weeks: WeekProgress[];
  currentWeek: WeekProgress | null;
  loading: boolean;
  error: string | null;
  reload: () => void;
}

/**
 * 把接口的一周汇总读成本页要用的形状。
 *
 * `avg_pace_s_per_km` 在接口里可能整个字段不存在（没有距离就没有配速），
 * 所以这里显式收成 `null`：字段缺失与配速为 0 是两件事。
 */
function mapWeekProgress(row: Generated.WeeklyProgressResponseOutput): WeekProgress {
  return {
    week: row.week,
    planned_tss: row.planned_tss,
    actual_tss: row.actual_tss,
    planned_sessions: row.planned_sessions,
    actual_sessions: row.actual_sessions,
    completion_pct: row.completion_pct,
    planned_distance_m: row.planned_distance_m,
    actual_distance_m: row.actual_distance_m,
    actual_elevation_m: row.actual_elevation_m ?? 0,
    avg_pace_s_per_km: row.avg_pace_s_per_km ?? null,
    remaining_distance_m: row.remaining_distance_m ?? 0,
  };
}

export function useWeeklyProgress(
  from?: string,
  to?: string,
): UseWeeklyProgressResult {
  // Monday-anchored, so a host/athlete day disagreement shifts the whole week
  // rather than one edge of it.
  const timezone = useAthleteTimezone();
  const week = athleteWeekRange(timezone);
  const range = { from: from ?? week.from, to: to ?? week.to };
  const params = { from: range.from, to: range.to };
  const { data, error, isLoading, mutate } = useSWR<WeekProgress[]>(
    ["/insights/weekly-progress", { from: range.from, to: range.to }],
    {
      fetcher: () =>
        callOrvalValidated(
          (f) => getWeeklyProgressApiV1InsightsWeeklyProgressGet(params, {}, f),
          z.array(Generated.WeeklyProgressResponse),
        ).then((rows) => rows.map(mapWeekProgress)),
    },
  );
  const weeks = Array.isArray(data) ? data : [];

  const latest = weeks.length > 0 ? weeks[weeks.length - 1] : null;
  return {
    weeks,
    currentWeek: latest ?? null,
    loading: isLoading,
    error: error?.message ?? null,
    reload: () => void mutate(),
  };
}
