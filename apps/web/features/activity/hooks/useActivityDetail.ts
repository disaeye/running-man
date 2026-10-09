"use client";

import useSWR from "swr";
import type { ActivityDetail } from "@shared/types/activity";
import { callOrvalValidated } from "@shared/api/orval-adapter";
import { getActivityApiV1ActivitiesActivityIdGet } from "@shared/api/generated/clients";
import * as Generated from "@shared/api/generated/model";
import { nn } from "@shared/lib/dto-nullable";

export interface UseActivityDetailResult {
  data: ActivityDetail | null;
  loading: boolean;
  error: string | null;
  reload: () => void;
}

export function useActivityDetail(id: string | undefined): UseActivityDetailResult {
  const { data, error, isLoading, mutate } = useSWR<ActivityDetail>(
    id ? [`/activities/${id}`, {}] : null,
    {
      fetcher: async () => {
        if (!id) throw new Error("SWR guard: id required");
        return callOrvalValidated(
          (f) => getActivityApiV1ActivitiesActivityIdGet(id, {}, f),
          Generated.ActivityDetail,
        ).then(mapActivityDetail);
      },
    },
  );

  return {
    data: data ?? null,
    loading: isLoading,
    error: error?.message ?? null,
    reload: () => void mutate(),
  };
}

function mapActivityDetail(raw: Generated.ActivityDetailOutput): ActivityDetail {
  return {
    activity_id: raw.activity_id,
    sport: raw.sport,
    start_time: raw.start_time,
    distance_m: nn(raw.distance_m),
    duration_s: nn(raw.duration_s),
    avg_hr: nn(raw.avg_hr),
    max_hr: nn(raw.max_hr),
    avg_power: nn(raw.avg_power),
    np: nn(raw.np),
    intensity_factor: nn(raw.intensity_factor),
    tss: nn(raw.tss),
    icu_ctl: nn(raw.icu_ctl),
    avg_cadence: nn(raw.avg_cadence),
    avg_speed: nn(raw.avg_speed),
    elevation_gain_m: nn(raw.elevation_gain_m),
    calories: nn(raw.calories),
    external_id: nn(raw.external_id),
    source: nn(raw.source),
    file_type: nn(raw.file_type),
    device_name: nn(raw.device_name),
    summary_polyline: nn(raw.summary_polyline),
    raw_data: raw.raw_data ?? null,
    has_gps: raw.has_gps ?? false,
    has_hr: raw.has_hr ?? false,
    has_power: raw.has_power ?? false,
    has_cadence: raw.has_cadence ?? false,
    weather: raw.weather ?? null,
  };
}
