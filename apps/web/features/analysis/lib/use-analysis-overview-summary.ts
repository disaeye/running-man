"use client";

// Pure data wiring for the Analysis overview. Aggregates run distance,
// wellness, readiness, intensity, and physiology from existing hooks.

import { useMemo } from "react";
import { athleteRange, useAthleteTimezone } from "@shared/lib/training-day";
import { useWellness } from "@features/health/hooks/useWellness";
import { useReadiness } from "@features/today/hooks/useReadiness";
import { useWeeklyProgress } from "@features/today/hooks/useWeeklyProgress";
import { useProfile } from "@features/settings/hooks/useProfile";
import { useIntensityDistribution } from "@features/performance/hooks/useIntensityDistribution";
import {
  buildAnalysisExecutiveSummary,
  type AnalysisExecutiveSummary,
  type AnalysisPerformanceSample,
} from "./analysis-summary";
import { summarizeIntensityDistribution } from "./intensity-analysis-copy";

interface UseAnalysisOverviewSummaryResult {
  readonly summary: AnalysisExecutiveSummary;
  readonly loading: boolean;
  readonly error: string | null;
  readonly wellnessCount: number;
  readonly intensityCount: number;
  readonly readiness: ReturnType<typeof useReadiness>["data"];
  readonly wellness: ReturnType<typeof useWellness>["data"];
  readonly intensity: ReturnType<typeof useIntensityDistribution>["data"];
}

export function useAnalysisOverviewSummary(): UseAnalysisOverviewSummaryResult {
  // Use a fixed 90-day window so the overview is deterministic regardless
  // of any user-selected range. The page-level range only governs the
  // detail tabs, not the overview summary.
  const timezone = useAthleteTimezone();
  const range = useMemo(() => athleteRange(90, timezone), [timezone]);

  const wellnessQuery = useWellness(range.from, range.to);
  const readinessQuery = useReadiness();
  const weeksQuery = useWeeklyProgress(range.from, range.to);
  const intensityQuery = useIntensityDistribution();
  const profileQuery = useProfile();

  const intensitySummary = useMemo(
    () => summarizeIntensityDistribution(intensityQuery.data),
    [intensityQuery.data],
  );

  const summary = useMemo(() => {
    const sample: AnalysisPerformanceSample = {
      sport: profileQuery.profile?.preferred_sport ?? null,
      lthr: profileQuery.profile?.lthr ?? null,
      thresholdPace: profileQuery.profile?.threshold_pace ?? null,
      vo2max: latestVo2(wellnessQuery.data),
      sessionRecordCount: 0,
    };
    return buildAnalysisExecutiveSummary({
      weeks: weeksQuery.weeks,
      wellness: wellnessQuery.data,
      readiness: readinessQuery.data?.local_readiness ?? null,
      intensitySummary,
      performanceSample: sample,
      dateRange: range,
      sampleCount: wellnessQuery.data.length,
    });
  }, [
    weeksQuery.weeks,
    wellnessQuery.data,
    readinessQuery.data,
    intensitySummary,
    profileQuery.profile,
    range,
  ]);

  return {
    summary,
    loading:
      wellnessQuery.loading ||
      readinessQuery.loading ||
      weeksQuery.loading ||
      profileQuery.loading,
    error:
      wellnessQuery.error ??
      readinessQuery.error ??
      weeksQuery.error ??
      null,
    wellnessCount: wellnessQuery.data.length,
    intensityCount: intensityQuery.data.length,
    readiness: readinessQuery.data,
    wellness: wellnessQuery.data,
    intensity: intensityQuery.data,
  };
}

interface WellnessVo2 {
  readonly vo2max: number | null;
}

function latestVo2(rows: readonly WellnessVo2[]): number | null {
  for (let i = rows.length - 1; i >= 0; i--) {
    const value = rows[i]?.vo2max;
    if (typeof value === "number") return value;
  }
  return null;
}
