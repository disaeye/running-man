"use client";

import useSWR from "swr";
import { callOrvalValidated } from "@shared/api/orval-adapter";
import { getActivityAnalysisApiV1ActivitiesActivityIdAnalysisGet } from "@shared/api/generated/clients";
import * as Generated from "@shared/api/generated/model";

export interface Lap {
  lap_index: number;
  distance_m: number;
  duration_s: number;
  avg_hr: number | null;
  avg_pace?: number | null;
  elevation_gain?: number | null;
}

export interface HrZones {
  z1: number;
  z2: number;
  z3: number;
  z4: number;
  z5: number;
}

export interface PowerCurvePoint {
  duration_s: number;
  avg_w: number;
}

export interface AnalysisSummary {
  np: number | null;
  if_val: number | null;
  tss: number | null;
  decoupling_pct: number | null;
}

export interface ActivityAnalysis {
  laps: Lap[];
  hr_zones: HrZones | null;
  power_curve: PowerCurvePoint[];
  summary: AnalysisSummary | null;
}

function mapAnalysis(raw: Generated.ActivityAnalysisResponseOutput): ActivityAnalysis {
  return {
    laps: raw.laps.map((lap) => ({
      lap_index: lap.lap_index,
      distance_m: lap.distance_m,
      duration_s: lap.duration_s,
      avg_hr: lap.avg_hr,
      avg_pace: lap.distance_m > 0 && lap.duration_s > 0
        ? lap.distance_m / lap.duration_s
        : null,
      elevation_gain: null,
    })),
    hr_zones: raw.hr_zones,
    power_curve: raw.power_curve,
    summary: raw.summary
      ? {
          np: raw.summary.np,
          if_val: raw.summary.if,
          tss: raw.summary.tss,
          decoupling_pct: raw.summary.decoupling_pct ?? null,
        }
      : null,
  };
}

export function useActivityAnalysis(id: string | undefined) {
  const { data, error, isLoading } = useSWR<ActivityAnalysis>(
    id ? [`/activities/${id}/analysis`, {}] : null,
    {
      fetcher: async () => {
        if (!id) throw new Error("SWR guard: id required");
        return callOrvalValidated(
          (f) => getActivityAnalysisApiV1ActivitiesActivityIdAnalysisGet(id, {}, f),
          Generated.ActivityAnalysisResponse,
        ).then(mapAnalysis);
      },
    },
  );

  return { data: data ?? null, loading: isLoading, error: error?.message ?? null };
}
