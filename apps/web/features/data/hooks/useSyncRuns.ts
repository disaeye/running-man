"use client";

import useSWR from "swr";
import { callOrvalValidated } from "@shared/api/orval-adapter";
import { listSyncRunsApiV1IntegrationsSyncRunsGet } from "@shared/api/generated/clients";
import * as Generated from "@shared/api/generated/model";
import { z } from "zod";
import { narrowToLiteral } from "@shared/lib/dto-nullable";

export interface SyncRunRow {
  id: string;
  source: string;
  trigger: string;
  window_start: string | null;
  window_end: string | null;
  started_at: string | null;
  finished_at: string | null;
  status: "running" | "success" | "partial" | "failed";
  activities_seen: number;
  activities_upserted: number;
  activities_deduplicated: number;
  wellness_seen: number;
  streams_inserted: number;
  errors_count: number;
  error_summary: string | null;
  detail: unknown;
}

const SYNC_RUN_STATUSES: readonly SyncRunRow["status"][] = [
  "running",
  "success",
  "partial",
  "failed",
];

function mapSyncRun(raw: Generated.SyncRunResponseOutput): SyncRunRow {
  return {
    id: raw.id,
    source: raw.source,
    trigger: raw.trigger,
    window_start: raw.window_start ?? null,
    window_end: raw.window_end ?? null,
    started_at: raw.started_at,
    finished_at: raw.finished_at ?? null,
    status: narrowToLiteral(raw.status, SYNC_RUN_STATUSES, "failed"),
    activities_seen: raw.activities_seen ?? 0,
    activities_upserted: raw.activities_upserted,
    activities_deduplicated: raw.activities_deduplicated,
    wellness_seen: raw.wellness_seen,
    streams_inserted: raw.streams_inserted,
    errors_count: raw.errors_count,
    error_summary: raw.error_summary ?? null,
    detail: raw.detail ?? null,
  };
}

export interface SyncRunFilters {
  limit?: number;
  source?: string;
  status?: string;
}

export function useSyncRuns(options: number | SyncRunFilters = 50) {
  const opts: SyncRunFilters =
    typeof options === "number" ? { limit: options } : options;
  const limit = opts.limit ?? 50;
  const source = opts.source;
  const status = opts.status;

  const { data, error, isLoading, mutate } = useSWR<SyncRunRow[]>(
    ["/integrations/sync-runs", { limit, source, status }],
    {
      fetcher: () =>
        callOrvalValidated(
          (f) => listSyncRunsApiV1IntegrationsSyncRunsGet({}, {}, f),
          z.array(Generated.SyncRunResponse),
        ).then((rows) => {
          let mapped = rows.map(mapSyncRun);
          if (source) mapped = mapped.filter((r) => r.source === source);
          if (status) mapped = mapped.filter((r) => r.status === status);
          return mapped.slice(0, limit);
        }),
      shouldRetryOnError: false,
    },
  );
  return {
    data: data ?? [],
    loading: isLoading,
    error: error?.message ?? null,
    mutate,
    reload: () => mutate(),
  };
}
