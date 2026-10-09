"use client";

import type { ReactNode } from "react";
import { SWRConfig } from "swr";
import { swrFetcher } from "@shared/lib/swr-fetcher";

/**
 * Global SWR configuration.
 *
 * - revalidateOnFocus: disabled to avoid surprising global refetches; hooks
 *   with user-triggered mutations invalidate their own cache entries.
 * - dedupingInterval: 5s window collapses in-flight + just-completed identical
 *   requests (PMC 90d fetched by both TodayStatusBar and PmcTrendChart → 1 request).
 * - refreshInterval: 0 (polling is opt-in per-hook via useSWR's refreshInterval).
 */
export function SWRProvider({ children }: { children: ReactNode }) {
  return (
    <SWRConfig
      value={{
        fetcher: swrFetcher,
        revalidateOnFocus: false,
        dedupingInterval: 5000,
        refreshInterval: 0,
      }}
    >
      {children}
    </SWRConfig>
  );
}
