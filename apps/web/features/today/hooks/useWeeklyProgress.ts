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
}

interface UseWeeklyProgressResult {
  weeks: WeekProgress[];
  currentWeek: WeekProgress | null;
  loading: boolean;
  error: string | null;
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
  const { data, error, isLoading } = useSWR<WeekProgress[]>(
    ["/insights/weekly-progress", { from: range.from, to: range.to }],
    {
      fetcher: () =>
        callOrvalValidated(
          (f) => getWeeklyProgressApiV1InsightsWeeklyProgressGet(params, {}, f),
          z.array(Generated.WeeklyProgressResponse),
        ),
    },
  );
  const weeks = Array.isArray(data) ? data : [];

  const latest = weeks.length > 0 ? weeks[weeks.length - 1] : null;
  return {
    weeks,
    currentWeek: latest ?? null,
    loading: isLoading,
    error: error?.message ?? null,
  };
}
