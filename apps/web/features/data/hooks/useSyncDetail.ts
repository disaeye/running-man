"use client";

import useSWR from "swr";
import type { IntegrationSource, IntegrationStatus } from "./useIntegrations";

export type StalenessBucket = "fresh" | "stale" | "missing" | "unknown";

export interface SyncDetail extends IntegrationStatus {
  last_sync_detail: Record<string, unknown> | null;
  staleness_bucket: StalenessBucket;
}

/**
 * Reads the same SWR cache key as useIntegrations so cards stay in lockstep.
 * No separate fetcher — parent useIntegrations owns the network load.
 */
export function useSyncDetail(source: IntegrationSource) {
  const { data, error, isLoading } = useSWR<IntegrationStatus>(
    [`/integrations/${source}`, {}],
    { shouldRetryOnError: false },
  );

  const detail: SyncDetail | null = data
    ? {
        ...data,
        last_sync_detail: data.last_sync_detail ?? null,
        staleness_bucket: data.staleness_bucket ?? "unknown",
      }
    : null;

  return {
    data: detail,
    loading: isLoading,
    error: error?.message ?? null,
  };
}
