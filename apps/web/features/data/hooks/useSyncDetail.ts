"use client";

import useSWR from "swr";
import { integrationQuery, type IntegrationSource, type IntegrationStatus } from "./useIntegrations";

export type StalenessBucket = "fresh" | "stale" | "missing" | "unknown";

export interface SyncDetail extends IntegrationStatus {
  last_sync_detail: Record<string, unknown> | null;
  staleness_bucket: StalenessBucket;
}

/**
 * Reads the same SWR cache entry as useIntegrations, so a card and the overview
 * cannot disagree about whether a source is connected.
 *
 * It must pass the fetcher, not just the key. SWR dedupes by key, so passing the
 * same fetcher costs no extra request; omitting it makes the hook fall back to
 * the global fetcher, which returns the raw API body. Whichever hook mounted
 * first then decided what the cache held — and with the raw body in it, every
 * `status === "connected"` check read `undefined` and the source rendered as
 * 未连接 while the API said `connected: true`.
 */
export function useSyncDetail(source: IntegrationSource) {
  const query = integrationQuery(source);
  const { data, error, isLoading } = useSWR<IntegrationStatus>(query.key, {
    shouldRetryOnError: false,
    fetcher: query.fetcher,
  });

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
