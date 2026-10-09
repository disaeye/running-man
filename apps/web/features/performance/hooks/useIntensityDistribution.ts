"use client";

import useSWR from "swr";
import type { IntensityPoint } from "@features/performance/components/PerformanceIntensity";
import { callOrvalValidated } from "@shared/api/orval-adapter";
import { getIntensityDistributionApiV1InsightsIntensityDistributionGet } from "@shared/api/generated/clients";
import * as Generated from "@shared/api/generated/model";
import { z } from "zod";

interface UseIntensityDistributionResult {
  data: IntensityPoint[];
  loading: boolean;
  error: string | null;
}

function mapToPoint(row: Generated.IntensityDistributionResponseOutput): IntensityPoint {
  return { bucket: row.bucket, zoneSeconds: row.zone_seconds };
}

export function useIntensityDistribution(
  from?: string,
  to?: string,
): UseIntensityDistributionResult {
  const rangeParams = from && to ? { from, to } : {};
  const { data, error, isLoading } = useSWR<IntensityPoint[]>(
    ["/insights/intensity-distribution", rangeParams],
    {
      fetcher: () =>
        callOrvalValidated(
          (f) => getIntensityDistributionApiV1InsightsIntensityDistributionGet(rangeParams, {}, f),
          z.array(Generated.IntensityDistributionResponse),
        ).then((rows) => rows.map(mapToPoint)),
    },
  );

  return {
    data: Array.isArray(data) ? data.filter(hasZoneData) : [],
    loading: isLoading,
    error: error?.message ?? null,
  };
}

function hasZoneData(row: IntensityPoint): boolean {
  return Array.isArray(row.zoneSeconds) && row.zoneSeconds.some((seconds) => seconds > 0);
}
