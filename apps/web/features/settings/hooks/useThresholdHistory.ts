"use client";

import useSWR from "swr";
import { callOrvalValidated } from "@shared/api/orval-adapter";
import { thresholdHistoryApiV1AthletesMeThresholdsGet } from "@shared/api/generated/clients";
import * as Generated from "@shared/api/generated/model";
import { z } from "zod";

export type ThresholdHistoryEntry = Generated.ThresholdHistoryEntryOutput;

export function useThresholdHistory() {
  const { data, error, isLoading, mutate } = useSWR<ThresholdHistoryEntry[]>(
    ["/athletes/me/thresholds", {}],
    {
      fetcher: () =>
        callOrvalValidated(
          (fetchFn) => thresholdHistoryApiV1AthletesMeThresholdsGet({}, fetchFn),
          z.array(Generated.ThresholdHistoryEntry),
        ),
    },
  );

  return {
    entries: data ?? [],
    loading: isLoading,
    error: error?.message ?? null,
    reload: () => void mutate(),
  };
}
