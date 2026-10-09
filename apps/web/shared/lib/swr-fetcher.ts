"use client";

import { apiFetch } from "@shared/lib/api";

/**
 * Shared SWR fetcher.
 *
 * SWR keys are `[url, params]` tuples — identical url + params collapse to
 * a single cache entry, which is how the today page dedupes PMC 7d vs 90d
 * and shares the 90d fetch with PmcTrendChart.
 */
type SwrKey = string | readonly [string, Record<string, string>];

export async function swrFetcher<T>(key: SwrKey): Promise<T> {
  const [url, params] = Array.isArray(key) ? key : [key, undefined];
  return apiFetch<T>(url, { params });
}
