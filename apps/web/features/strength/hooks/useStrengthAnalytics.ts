"use client";

import useSWR from "swr";
import { callOrvalValidated } from "@shared/api/orval-adapter";
import type { MuscleVolumeItem, E1rmItem, DistributionItem } from "@shared/types/strength";
import {
  muscleVolumeApiV1StrengthAnalyticsMuscleVolumeGet,
  e1rmTrendApiV1StrengthAnalyticsE1rmGet,
  muscleDistributionApiV1StrengthAnalyticsDistributionGet,
} from "@shared/api/generated/clients";
import * as Generated from "@shared/api/generated/model";
import { toMuscleVolumeAndDistribution } from "@features/strength/lib/strength-analytics";
import { z } from "zod";

interface DateRange {
  from?: string;
  to?: string;
}

export interface UseStrengthAnalyticsResult {
  muscleVolume: MuscleVolumeItem[];
  e1rm: E1rmItem[];
  distribution: DistributionItem[];
  loading: boolean;
  error: string | null;
}

function toE1rmItem(row: Generated.E1rmTrendResponseOutput): E1rmItem {
  return {
    date: row.date,
    exercise_id: row.exercise_id,
    exercise_name: row.name_cn,
    estimated_1rm_kg: row.max_estimated_1rm_kg,
  };
}

export function useStrengthAnalytics(range: DateRange = {}): UseStrengthAnalyticsResult {
  const params: { from?: string; to?: string } = {};
  if (range.from) params.from = range.from;
  if (range.to) params.to = range.to;

  const combinedResult = useSWR<{
    readonly muscleVolume: MuscleVolumeItem[];
    readonly distribution: DistributionItem[];
  }>(["/strength/analytics/combined", params], async () => {
    const [volumeRows, distributionRows] = await Promise.all([
      callOrvalValidated(
        (fetchFn) => muscleVolumeApiV1StrengthAnalyticsMuscleVolumeGet(params, {}, fetchFn),
        z.array(Generated.MuscleVolumeResponse),
      ),
      callOrvalValidated(
        (fetchFn) => muscleDistributionApiV1StrengthAnalyticsDistributionGet(params, {}, fetchFn),
        z.array(Generated.MuscleDistributionResponse),
      ),
    ]);
    return toMuscleVolumeAndDistribution(volumeRows, distributionRows);
  });

  const e1rmResult = useSWR<E1rmItem[]>(["/strength/analytics/e1rm", params], {
    fetcher: () =>
      callOrvalValidated(
        (fetchFn) => e1rmTrendApiV1StrengthAnalyticsE1rmGet(params, {}, fetchFn),
        z.array(Generated.E1rmTrendResponse),
      ).then((rows) => rows.map(toE1rmItem)),
  });

  return {
    muscleVolume: combinedResult.data?.muscleVolume ?? [],
    e1rm: e1rmResult.data ?? [],
    distribution: combinedResult.data?.distribution ?? [],
    loading: combinedResult.isLoading || e1rmResult.isLoading,
    error: combinedResult.error?.message ?? e1rmResult.error?.message ?? null,
  };
}
