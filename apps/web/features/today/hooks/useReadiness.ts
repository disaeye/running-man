"use client";

import useSWR from "swr";
import { toISODate } from "@shared/lib/format";
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

function mapReadiness(
  raw: Generated.ReadinessResponseOutput,
): ReadinessResponse {
  const lr = raw.local_readiness;
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
  const target = day ?? toISODate(new Date());
  const params = { date: target };
  const { data, error, isLoading, mutate } = useSWR<ReadinessResponse>(
    ["/insights/readiness", { date: target }],
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
