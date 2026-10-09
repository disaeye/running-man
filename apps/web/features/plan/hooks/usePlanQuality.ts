"use client";

import useSWR from "swr";
import { callOrvalValidated } from "@shared/api/orval-adapter";
import { getPlanQualityApiV1InsightsPlanQualityGet } from "@shared/api/generated/clients";
import * as Generated from "@shared/api/generated/model";

export interface PlanQualityResponse {
  grade: "A" | "B" | "C" | "D" | "F" | null;
  score: number;
  message: string;
  weekly_tss: number;
  target_tss: number;
  key_sessions_completed: number;
  key_sessions_total: number;
  concerns: string[];
}

export interface PlanQualityRange {
  readonly from: string;
  readonly to: string;
}

interface UsePlanQualityResult {
  data: PlanQualityResponse | null;
  loading: boolean;
  error: string | null;
}

function mapGrade(grade: string): PlanQualityResponse["grade"] {
  switch (grade) {
    case "A":
    case "B":
    case "C":
    case "D":
    case "F":
      return grade;
    case "B+":
      return "B";
    default:
      return null;
  }
}

function mapPlanQuality(raw: Generated.PlanQualityResponseOutput): PlanQualityResponse {
  return {
    grade: mapGrade(raw.grade),
    score: raw.score,
    message: raw.message,
    weekly_tss: raw.weekly_tss,
    target_tss: raw.target_tss,
    key_sessions_completed: raw.key_sessions_completed,
    key_sessions_total: raw.key_sessions_total,
    concerns: raw.concerns,
  };
}

export function usePlanQuality(range?: PlanQualityRange): UsePlanQualityResult {
  const swrKey = range
    ? (["/insights/plan-quality", range.from, range.to] as const)
    : (["/insights/plan-quality"] as const);

  const { data, error, isLoading } = useSWR<PlanQualityResponse>(
    swrKey,
    {
      fetcher: () =>
        callOrvalValidated(
          (f) =>
            getPlanQualityApiV1InsightsPlanQualityGet(
              range ? { from: range.from, to: range.to } : {},
              {},
              f,
            ),
          Generated.PlanQualityResponse,
        ).then(mapPlanQuality),
    },
  );

  return { data: data ?? null, loading: isLoading, error: error?.message ?? null };
}
