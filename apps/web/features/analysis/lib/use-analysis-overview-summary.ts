"use client";

// Pure data wiring for the Analysis overview. Aggregates PMC, wellness,
// readiness, intensity, and physiology into a single executive summary call
// without making any new fetch — every input flows through existing hooks.

import { useMemo } from "react";
import { useMemo as useMemoRef } from "react";
import { computeRange } from "@shared/lib/format";
import { usePmcData, type PmcPoint } from "@features/pmc/hooks/usePmcData";
import { useWellness } from "@features/health/hooks/useWellness";
import { useReadiness } from "@features/today/hooks/useReadiness";
import { useWeeklyProgress } from "@features/today/hooks/useWeeklyProgress";
import { useProfile, useZones } from "@features/settings/hooks/useProfile";
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
  readonly pmcCount: number;
  readonly wellnessCount: number;
  readonly intensityCount: number;
  readonly readiness: ReturnType<typeof useReadiness>["data"];
  readonly wellness: ReturnType<typeof useWellness>["data"];
  readonly intensity: ReturnType<typeof useIntensityDistribution>["data"];
  readonly pmc: readonly PmcPoint[];
}

export function useAnalysisOverviewSummary(): UseAnalysisOverviewSummaryResult {
  // Use a fixed 90-day window so the overview is deterministic regardless
  // of any user-selected range. The page-level range only governs the
  // detail tabs (load/recovery), not the verdict/risk/next-step summary.
  const range = useMemo(() => computeRange(90), []);

  const pmcQuery = usePmcData(range.from, range.to);
  const wellnessQuery = useWellness(range.from, range.to);
  const readinessQuery = useReadiness();
  const weeksQuery = useWeeklyProgress(range.from, range.to);
  const intensityQuery = useIntensityDistribution();
  const profileQuery = useProfile();
  const zonesQuery = useZones();

  const intensitySummary = useMemo(
    () => summarizeIntensityDistribution(intensityQuery.data),
    [intensityQuery.data],
  );

  const summary = useMemoRef(() => {
    const sample: AnalysisPerformanceSample = {
      sport: profileQuery.profile?.preferred_sport ?? null,
      ftp: zonesQuery.zones?.ftp ?? null,
      lthr: profileQuery.profile?.lthr ?? null,
      thresholdPace: profileQuery.profile?.threshold_pace ?? null,
      vo2max: latestVo2(wellnessQuery.data),
      sessionRecordCount: 0,
    };
    return buildAnalysisExecutiveSummary({
      pmcPoints: pmcQuery.data,
      weeks: weeksQuery.weeks,
      wellness: wellnessQuery.data,
      readiness: readinessQuery.data?.local_readiness ?? null,
      intensitySummary,
      performanceSample: sample,
      dateRange: range,
      sampleCount: wellnessQuery.data.length + pmcQuery.data.length,
    });
  }, [
    pmcQuery.data,
    weeksQuery.weeks,
    wellnessQuery.data,
    readinessQuery.data,
    intensitySummary,
    profileQuery.profile,
    zonesQuery.zones,
    range.from,
    range.to,
  ]);

  return {
    summary,
    loading:
      pmcQuery.loading ||
      wellnessQuery.loading ||
      readinessQuery.loading ||
      weeksQuery.loading ||
      zoneLoading(profileQuery.loading, zonesQuery.loading),
    error:
      pmcQuery.error ??
      wellnessQuery.error ??
      readinessQuery.error ??
      weeksQuery.error ??
      null,
    pmcCount: pmcQuery.data.length,
    wellnessCount: wellnessQuery.data.length,
    intensityCount: intensityQuery.data.length,
    readiness: readinessQuery.data,
    wellness: wellnessQuery.data,
    intensity: intensityQuery.data,
    pmc: pmcQuery.data,
  };
}

function zoneLoading(
  profileLoading: boolean,
  zonesLoading: boolean,
): boolean {
  return profileLoading || zonesLoading;
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
