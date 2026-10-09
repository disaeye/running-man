"use client";

import useSWR from "swr";
import { callOrvalValidated } from "@shared/api/orval-adapter";
import type {
  MuscleVolumeItem,
  E1rmItem,
  DistributionItem,
} from "@shared/types/strength";
import {
  muscleVolumeApiV1StrengthAnalyticsMuscleVolumeGet,
  e1rmTrendApiV1StrengthAnalyticsE1rmGet,
  muscleDistributionApiV1StrengthAnalyticsDistributionGet,
} from "@shared/api/generated/clients";
import * as Generated from "@shared/api/generated/model";
import { z } from "zod";

interface DateRange {
  from?: string;
  to?: string;
}

interface UseStrengthAnalyticsResult {
  muscleVolume: MuscleVolumeItem[];
  e1rm: E1rmItem[];
  distribution: DistributionItem[];
  loading: boolean;
  error: string | null;
}

function toVolumeItem(row: Generated.MuscleVolumeResponseOutput): MuscleVolumeItem {
  return {
    muscle: row.muscle_group,
    volume_kg: row.volume_kg,
    exercise_count: 0,
    set_count: 0,
  };
}

function toE1rmItem(row: Generated.E1rmTrendResponseOutput): E1rmItem {
  return {
    date: row.date,
    exercise_id: row.exercise_id,
    exercise_name: row.name_cn,
    estimated_1rm_kg: row.max_estimated_1rm_kg,
  };
}

function toDistributionItem(
  row: Generated.MuscleDistributionResponseOutput,
): DistributionItem {
  return {
    category: row.category,
    percentage: 0,
    volume_kg: row.volume_kg,
  };
}

export function useStrengthAnalytics(
  range: DateRange = {},
): UseStrengthAnalyticsResult {
  const params: { from?: string; to?: string } = {};
  if (range.from) params.from = range.from;
  if (range.to) params.to = range.to;

  const muscleVolumeResult = useSWR<MuscleVolumeItem[]>(
    ["/strength/analytics/muscle-volume", params],
    {
      fetcher: () =>
        callOrvalValidated(
          (f) => muscleVolumeApiV1StrengthAnalyticsMuscleVolumeGet(params, {}, f),
          z.array(Generated.MuscleVolumeResponse),
        ).then((rows) => rows.map(toVolumeItem)),
    },
  );

  const e1rmResult = useSWR<E1rmItem[]>(
    ["/strength/analytics/e1rm", params],
    {
      fetcher: () =>
        callOrvalValidated(
          (f) => e1rmTrendApiV1StrengthAnalyticsE1rmGet(params, {}, f),
          z.array(Generated.E1rmTrendResponse),
        ).then((rows) => rows.map(toE1rmItem)),
    },
  );

  const distributionResult = useSWR<DistributionItem[]>(
    ["/strength/analytics/distribution", params],
    {
      fetcher: () =>
        callOrvalValidated(
          (f) => muscleDistributionApiV1StrengthAnalyticsDistributionGet(params, {}, f),
          z.array(Generated.MuscleDistributionResponse),
        ).then((rows) => rows.map(toDistributionItem)),
    },
  );

  return {
    muscleVolume: muscleVolumeResult.data ?? [],
    e1rm: e1rmResult.data ?? [],
    distribution: distributionResult.data ?? [],
    loading:
      muscleVolumeResult.isLoading ||
      e1rmResult.isLoading ||
      distributionResult.isLoading,
    error:
      muscleVolumeResult.error?.message ??
      e1rmResult.error?.message ??
      distributionResult.error?.message ??
      null,
  };
}
