"use client";

import useSWR from "swr";
import type { ActivitySummary } from "@shared/types/activity";
import { callOrvalValidated } from "@shared/api/orval-adapter";
import * as Generated from "@shared/api/generated/model";
import { listActivitiesApiV1ActivitiesGet } from "@shared/api/generated/clients";
import { z } from "zod";
import { nn } from "@shared/lib/dto-nullable";

export interface UseActivitiesResult {
  data: ActivitySummary[];
  loading: boolean;
  error: string | null;
  reload: () => void;
}

/**
 * Whether a date range is complete enough to query.
 *
 * The API requires both bounds and answers a missing one with 422, so this is
 * the difference between "still resolving the range" and "the request failed".
 * Callers that build a range from optional state pass `?? ""` while it loads;
 * treating that as a fetchable range is what produced the 422.
 *
 * Exported for testing — the guard is the behaviour worth asserting, and it is
 * reachable without rendering the hook.
 */
export function hasUsableRange(from: string, to: string): boolean {
  return Boolean(from && to);
}

export function useActivities(from: string, to: string): UseActivitiesResult {
  const params = { from, to };
  // An empty range is not a request for "all activities above". The API rejects
  // `?from=&to=` with 422, so passing an unresolved range (a caller with
  // `planRange?.from ?? ""`, for instance) turned a still-loading date into a
  // failed request and an error message on screen. A null key tells SWR not to
  // fetch yet, and the empty result keeps every caller's render path unchanged.
  const hasRange = hasUsableRange(from, to);
  const { data, error, isLoading, mutate } = useSWR<ActivitySummary[]>(
    hasRange ? ["/activities", params] : null,
    {
      fetcher: () =>
        callOrvalValidated(
          (f) => listActivitiesApiV1ActivitiesGet(params, {}, f),
          z.array(Generated.ActivitySummary),
        ).then((rows) => rows.map(mapActivitySummary)),
    },
  );

  return {
    data: data ?? [],
    // No range is not loading — nothing was requested. Reporting `isLoading`
    // here is what let the caller wait forever on a fetch that never starts.
    loading: hasRange && isLoading,
    error: error?.message ?? null,
    reload: () => void mutate(),
  };
}

function mapActivitySummary(
  row: Generated.ActivitySummaryOutput,
): ActivitySummary {
  return {
    activity_id: row.activity_id,
    sport: row.sport,
    start_time: row.start_time,
    distance_m: nn(row.distance_m),
    duration_s: nn(row.duration_s),
    avg_hr: nn(row.avg_hr),
    max_hr: nn(row.max_hr),
    avg_power: nn(row.avg_power),
    np: nn(row.np),
    intensity_factor: nn(row.intensity_factor),
    tss: nn(row.tss),
    icu_ctl: nn(row.icu_ctl),
    avg_cadence: nn(row.avg_cadence),
    avg_speed: nn(row.avg_speed),
    elevation_gain_m: nn(row.elevation_gain_m),
    calories: nn(row.calories),
    external_id: nn(row.external_id),
    source: nn(row.source),
    has_gps: row.has_gps ?? false,
    file_type: nn(row.file_type),
    device_name: nn(row.device_name),
    summary_polyline: nn(row.summary_polyline),
  };
}
