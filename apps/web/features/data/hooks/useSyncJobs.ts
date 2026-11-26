"use client";

import { useEffect, useRef } from "react";
import useSWR, { useSWRConfig } from "swr";
import { invalidateDataCards } from "@features/data/lib/invalidate-after-sync";
import { callOrvalValidated } from "@shared/api/orval-adapter";
import {
  backfillIntegrationApiV1IntegrationsSourceBackfillPost,
  cancelSyncJobApiV1IntegrationsSourceJobsJobIdCancelPost,
  currentSyncJobApiV1IntegrationsSourceJobsCurrentGet,
  resyncActivityStreamsApiV1ActivitiesActivityIdStreamsSyncPost,
  resyncIntegrationApiV1IntegrationsSourceResyncPost,
  sourceCoverageApiV1IntegrationsSourceCoverageGet,
} from "@shared/api/generated/clients";
import * as Generated from "@shared/api/generated/model";
import type { IntegrationSource } from "./useIntegrations";

/** How often the job is re-read while it is queued or running. */
export const JOB_POLL_INTERVAL_MS = 2000;

export type SyncJobStatus =
  | "queued"
  | "running"
  | "success"
  | "failed"
  | "cancelled";

export interface SyncJobError {
  activityId: string;
  message: string;
}

export interface SyncJob {
  id: string;
  source: string;
  kind: "incremental" | "backfill";
  trigger: string;
  phase: "activities" | "streams" | "wellness" | "weather";
  status: SyncJobStatus;
  windowStart: string | null;
  windowEnd: string | null;
  windowsTotal: number;
  windowsDone: number;
  activitiesSeen: number;
  activitiesUpserted: number;
  activitiesDeduplicated: number;
  streamsInserted: number;
  wellnessDays: number;
  ghostsDeleted: number;
  errorsCount: number;
  errors: SyncJobError[];
  cancelRequested: boolean;
  error: string | null;
  startedAt: string | null;
  finishedAt: string | null;
  heartbeatAt: string | null;
  createdAt: string;
}

export interface SourceCoverage {
  firstActivityDate: string | null;
  lastActivityDate: string | null;
  activityCount: number;
}

const JOB_STATUSES: readonly SyncJobStatus[] = [
  "queued",
  "running",
  "success",
  "failed",
  "cancelled",
];
const PHASES: readonly SyncJob["phase"][] = ["activities", "streams", "wellness", "weather"];

export function isJobActive(job: SyncJob | null | undefined): boolean {
  return job?.status === "queued" || job?.status === "running";
}

export function mapJob(raw: Generated.SyncJobResponseOutput): SyncJob {
  return {
    id: raw.id,
    source: raw.source,
    kind: raw.kind === "backfill" ? "backfill" : "incremental",
    trigger: raw.trigger,
    phase: PHASES.includes(raw.phase as SyncJob["phase"])
      ? (raw.phase as SyncJob["phase"])
      : "activities",
    status: JOB_STATUSES.includes(raw.status as SyncJobStatus)
      ? (raw.status as SyncJobStatus)
      : "failed",
    windowStart: raw.window_start ?? null,
    windowEnd: raw.window_end ?? null,
    windowsTotal: raw.windows_total,
    windowsDone: raw.windows_done,
    activitiesSeen: raw.activities_seen,
    activitiesUpserted: raw.activities_upserted,
    activitiesDeduplicated: raw.activities_deduplicated,
    streamsInserted: raw.streams_inserted,
    wellnessDays: raw.wellness_days,
    ghostsDeleted: raw.ghosts_deleted,
    errorsCount: raw.errors_count,
    errors: (raw.errors ?? []).map((entry) => ({
      activityId: entry.activity_id,
      message: entry.message,
    })),
    cancelRequested: raw.cancel_requested,
    error: raw.error ?? null,
    startedAt: raw.started_at ?? null,
    finishedAt: raw.finished_at ?? null,
    heartbeatAt: raw.heartbeat_at ?? null,
    createdAt: raw.created_at,
  };
}

export function syncJobKey(source: IntegrationSource) {
  return [`/integrations/${source}/jobs/current`, {}] as const;
}

export function sourceCoverageKey(source: IntegrationSource) {
  return [`/integrations/${source}/coverage`, {}] as const;
}

/**
 * Latest job for a source, re-read every two seconds while one is active.
 *
 * Progress lives in the job row rather than in local state, so a reload or a
 * second browser tab shows the same numbers, and a job that outlives the page
 * is still visible when the athlete comes back.
 */
export function useSyncJob(source: IntegrationSource) {
  const { mutate: globalMutate } = useSWRConfig();
  const seenActiveIdRef = useRef<string | null>(null);
  const { data, error, isLoading, mutate } = useSWR<SyncJob | null>(
    syncJobKey(source),
    {
      shouldRetryOnError: false,
      refreshInterval: (job) => (isJobActive(job) ? JOB_POLL_INTERVAL_MS : 0),
      fetcher: () =>
        callOrvalValidated(
          (f) => currentSyncJobApiV1IntegrationsSourceJobsCurrentGet(source, {}, f),
          Generated.SyncJobResponse.nullable(),
        ).then((raw) => (raw === null ? null : mapJob(raw))),
    },
  );

  useEffect(() => {
    if (!data) return;
    if (isJobActive(data)) {
      seenActiveIdRef.current = data.id;
      return;
    }
    if (seenActiveIdRef.current !== data.id) return;
    seenActiveIdRef.current = null;
    if (data.status === "success") {
      void invalidateDataCards(globalMutate, source);
    }
  }, [data, globalMutate, source]);

  return {
    job: data ?? null,
    loading: isLoading,
    error: error?.message ?? null,
    reload: () => mutate(),
  };
}

export function useSourceCoverage(source: IntegrationSource) {
  const { data, error, isLoading } = useSWR<SourceCoverage>(
    sourceCoverageKey(source),
    {
      shouldRetryOnError: false,
      fetcher: () =>
        callOrvalValidated(
          (f) => sourceCoverageApiV1IntegrationsSourceCoverageGet(source, {}, f),
          Generated.SourceCoverageResponse,
        ).then((raw) => ({
          firstActivityDate: raw.first_activity_date ?? null,
          lastActivityDate: raw.last_activity_date ?? null,
          activityCount: raw.activity_count,
        })),
    },
  );

  return {
    coverage: data ?? null,
    loading: isLoading,
    error: error?.message ?? null,
  };
}

/** Queue a history import; the caller watches the job for progress. */
export async function startBackfill(
  source: IntegrationSource,
  fromDate: string,
): Promise<SyncJob> {
  const body: Generated.BackfillRequest = { from_date: fromDate };
  const raw = await callOrvalValidated(
    (f) => backfillIntegrationApiV1IntegrationsSourceBackfillPost(source, body, {}, f),
    Generated.SyncJobResponse,
  );
  return mapJob(raw);
}

/** Clear the source's imported data and re-import the athlete's full history. */
export async function resyncIntegration(
  source: IntegrationSource,
): Promise<SyncJob> {
  const raw = await callOrvalValidated(
    (f) => resyncIntegrationApiV1IntegrationsSourceResyncPost(source, {}, f),
    Generated.SyncJobResponse,
  );
  return mapJob(raw);
}

/** Ask the running job to stop at its next phase boundary. */
export async function cancelSyncJob(
  source: IntegrationSource,
  jobId: string,
): Promise<SyncJob> {
  const raw = await callOrvalValidated(
    (f) => cancelSyncJobApiV1IntegrationsSourceJobsJobIdCancelPost(source, jobId, {}, f),
    Generated.SyncJobResponse,
  );
  return mapJob(raw);
}

/** Re-download one activity's streams; used by the retry action on a failed row. */
export async function retryActivityStreams(activityId: string): Promise<number> {
  const result = await callOrvalValidated(
    (f) =>
      resyncActivityStreamsApiV1ActivitiesActivityIdStreamsSyncPost(activityId, {}, f),
    Generated.ActivityStreamSyncResponse,
  );
  return result.streams_inserted;
}
