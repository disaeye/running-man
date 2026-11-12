"use client";

import useSWR from "swr";
import { athleteToday, useAthleteTimezoneState } from "@shared/lib/training-day";
import { callOrvalValidated } from "@shared/api/orval-adapter";
import { getReadinessApiV1InsightsReadinessGet } from "@shared/api/generated/clients";
import * as Generated from "@shared/api/generated/model";
import type { ReadinessLevel } from "@shared/types/readiness";

export type { ReadinessLevel } from "@shared/types/readiness";

export interface ReadinessFactor {
  name: string;
  impact: "positive" | "negative" | "neutral";
  score?: number;
  detail: string;
}

export interface WellnessReading {
  /** 当前值。 */
  readonly value: number;
  /** 单位：ms / bpm / s。 */
  readonly unit: string;
  /** 本人七日均值。 */
  readonly baseline: number | null;
  /** 与七日均值的差。 */
  readonly delta: number | null;
  /** 实际测量日：设备分开上报各项指标，读数可能来自前一日。 */
  readonly observedOn: string | null;
}

export interface LocalReadiness {
  readonly score: number;
  readonly level: ReadinessLevel;
  readonly factors: readonly ReadinessFactor[];
  readonly recommendation: string;
  readonly max_intensity: "high" | "moderate" | "low" | "none";
  /** False when nothing was measured; `score` is then the neutral midpoint. */
  readonly data_sufficient: boolean;
  /** Date of the wellness observation the score was built from. */
  readonly observed_on: string | null;
  /** 当日的健康读数，与本人七日基线。 */
  readonly readings: {
    readonly hrv: WellnessReading | null;
    readonly resting_hr: WellnessReading | null;
    readonly sleep_secs: WellnessReading | null;
  };
  readonly provenance: {
    readonly wellness_as_of: string | null;
    readonly pmc_as_of: string | null;
    readonly factor_sources: Readonly<Record<string, "health_wellness" | "current_daily_facts">>;
  };
}

export interface SourceReadiness {
  readonly score: number;
  readonly source: "intervals_icu";
  readonly observed_on: string;
}

export interface ReadinessResponse {
  readonly local_readiness: LocalReadiness;
  readonly source_readiness: SourceReadiness | null;
}

interface UseReadinessResult {
  data: ReadinessResponse | null;
  loading: boolean;
  error: string | null;
  reload: () => void;
}

function mapReading(
  raw: Generated.WellnessReadingResponseOutput | null | undefined,
): WellnessReading | null {
  if (!raw) return null;
  return {
    value: raw.value,
    unit: raw.unit,
    baseline: raw.baseline ?? null,
    delta: raw.delta ?? null,
    observedOn: raw.observed_on ?? null,
  };
}

function mapReadiness(
  raw: Generated.ReadinessResponseOutput,
): ReadinessResponse {
  const lr = raw.local_readiness;
  const readings = lr.readings;
  return {
    local_readiness: {
      score: lr.score,
      level: lr.level,
      factors: lr.factors.map((f) => ({
        name: f.name,
        impact: f.impact,
        detail: f.detail,
      })),
      recommendation: lr.recommendation,
      max_intensity: lr.max_intensity,
      data_sufficient: lr.data_sufficient ?? false,
      observed_on: lr.observed_on ?? null,
      readings: {
        hrv: mapReading(readings?.hrv),
        resting_hr: mapReading(readings?.resting_hr),
        sleep_secs: mapReading(readings?.sleep_secs),
      },
      provenance: {
        wellness_as_of: lr.provenance.wellness_as_of,
        pmc_as_of: lr.provenance.pmc_as_of,
        factor_sources: lr.provenance.factor_sources,
      },
    },
    source_readiness: raw.source_readiness
      ? {
          score: raw.source_readiness.score,
          source: raw.source_readiness.source,
          observed_on: raw.source_readiness.observed_on,
        }
      : null,
  };
}

export function useReadiness(day?: string): UseReadinessResult {
  const { timezone, resolved } = useAthleteTimezoneState();
  const target = day ?? athleteToday(timezone);
  const params = { date: target };
  const ready = Boolean(day) || resolved;
  const { data, error, isLoading, mutate } = useSWR<ReadinessResponse>(
    ready ? ["/insights/readiness", { date: target }] : null,
    {
      fetcher: () =>
        callOrvalValidated(
          (f) => getReadinessApiV1InsightsReadinessGet(params, {}, f),
          Generated.ReadinessResponse,
        ).then(mapReadiness),
    },
  );

  return {
    data: data ?? null,
    loading: isLoading,
    error: error?.message ?? null,
    reload: () => void mutate(),
  };
}
