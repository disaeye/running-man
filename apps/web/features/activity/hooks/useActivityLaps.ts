"use client";

import useSWR from "swr";
import { callOrvalValidated } from "@shared/api/orval-adapter";
import { getLapsApiV1ActivitiesActivityIdLapsGet } from "@shared/api/generated/clients";
import * as Generated from "@shared/api/generated/model";
import { z } from "zod";
import type { Lap } from "@features/activity/hooks/useActivityAnalysis";

function mapLap(row: Generated.LapResponseOutput): Lap {
  const distance = row.distance_m ?? 0;
  const duration = row.duration_s ?? 0;
  return {
    lap_index: row.lap_index,
    distance_m: distance,
    duration_s: duration,
    avg_hr: row.avg_hr ?? null,
    avg_pace: distance > 0 && duration > 0 ? distance / duration : null,
    elevation_gain: null,
  };
}

/**
 * Device laps from FIT/TCX (activity_laps). Prefer these over stream-derived
 * algorithm laps when present — they match the athlete's watch splits.
 */
export function useActivityLaps(activityId: string | undefined) {
  const { data, error, isLoading } = useSWR<Lap[]>(
    activityId ? [`/activities/${activityId}/laps`, {}] : null,
    {
      fetcher: () => {
        if (!activityId) return Promise.resolve([]);
        return callOrvalValidated(
          (f) => getLapsApiV1ActivitiesActivityIdLapsGet(activityId, {}, f),
          z.array(Generated.LapResponse),
        ).then((rows) => rows.map(mapLap));
      },
      shouldRetryOnError: false,
    },
  );

  return {
    data: data ?? [],
    loading: isLoading,
    error: error?.message ?? null,
  };
}
