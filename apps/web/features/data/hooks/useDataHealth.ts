"use client";

import useSWR from "swr";
import { callOrvalValidated } from "@shared/api/orval-adapter";
import { getDataHealthApiV1DataHealthGet } from "@shared/api/generated/clients";
import * as Generated from "@shared/api/generated/model";

export interface DataHealthActivities {
  data_as_of: string | null;
  total: number;
  with_hr: number;
  with_gps: number;
  with_power: number;
  with_streams?: number;
}

export interface DataHealthWellness {
  data_as_of: string | null;
  total_days: number;
  latest_day: string | null;
}

export interface DataHealthTrainingLoad {
  data_as_of: string | null;
}
export interface DataHealthCompleteness {
  activities: {
    with_hr: number;
    with_gps: number;
    with_power: number;
  };
}

export interface DataHealthGap {
  from: string;
  to: string;
}

export interface DataHealth {
  activities: DataHealthActivities;
  wellness: DataHealthWellness;
  training_load: DataHealthTrainingLoad;
  completeness: DataHealthCompleteness;
  gaps: DataHealthGap[];
}

function mapDataHealth(raw: Generated.DataHealthResponseOutput): DataHealth {
  return {
    activities: {
      data_as_of: raw.activities.data_as_of ?? null,
      total: raw.activities.total,
      with_hr: raw.activities.with_hr,
      with_gps: raw.activities.with_gps,
      with_power: raw.activities.with_power,
      with_streams: raw.activities.with_streams ?? 0,
    },
    wellness: {
      data_as_of: raw.wellness.data_as_of ?? null,
      total_days: raw.wellness.total_days,
      latest_day: raw.wellness.latest_day ?? null,
    },
    training_load: {
      data_as_of: raw.training_load.data_as_of ?? null,
    },
    completeness: raw.completeness,
    gaps: raw.gaps,
  };
}

export function useDataHealth() {
  const { data, error, isLoading } = useSWR<DataHealth>(["/data/health", {}], {
    fetcher: () =>
      callOrvalValidated(
        (f) => getDataHealthApiV1DataHealthGet({}, f),
        Generated.DataHealthResponse,
      ).then(mapDataHealth),
  });

  return {
    data: data ?? null,
    loading: isLoading,
    error: error?.message ?? null,
  };
}
