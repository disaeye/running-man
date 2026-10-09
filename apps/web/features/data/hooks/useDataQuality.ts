"use client";

import useSWR from "swr";
import { callOrvalValidated } from "@shared/api/orval-adapter";
import { getDataQualityApiV1DataQualityGet } from "@shared/api/generated/clients";
import * as Generated from "@shared/api/generated/model";

export type QualitySummary = Generated.QualitySummaryResponse;
export type QualityIssue = Generated.DataQualityIssueResponse;
export type CoverageActivities = Generated.DataHealthActivityCoverageResponse;
export type CoverageWellness = Generated.DataHealthWellnessCoverageResponse;
export type DataQualityResponse = Generated.DataQualityResponse;

export function useDataQuality() {
  const { data, error, isLoading, isValidating, mutate } = useSWR<DataQualityResponse>(
    ["/data/quality", {}],
    {
      shouldRetryOnError: false,
      fetcher: () =>
        callOrvalValidated(
          (f) => getDataQualityApiV1DataQualityGet({}, f),
          Generated.DataQualityResponse,
        ),
    },
  );

  return {
    data: data ?? null,
    loading: isLoading,
    refreshing: isValidating,
    error: error?.message ?? null,
    reload: () => void mutate(),
  };
}
