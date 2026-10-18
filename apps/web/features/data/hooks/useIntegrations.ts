"use client";

import useSWR from "swr";
import { getSourceDefinition } from "@shared/config/generated/source-registry";
import { callOrval, callOrvalValidated } from "@shared/api/orval-adapter";
import * as Generated from "@shared/api/generated/model";
import {
  getIntegrationApiV1IntegrationsSourceGet,
  connectIntegrationApiV1IntegrationsSourceConnectPut,
  disconnectIntegrationApiV1IntegrationsSourceDisconnectDelete,
  syncIntegrationApiV1IntegrationsSourceSyncPost,
  updateSettingsApiV1IntegrationsSourceSettingsPut,
  currentSyncJobApiV1IntegrationsSourceJobsCurrentGet,
} from "@shared/api/generated/clients";
import { useCallback } from "react";
import { useSWRConfig } from "swr";
import { narrowToLiteral } from "@shared/lib/dto-nullable";
import { invalidateDataCards } from "@features/data/lib/invalidate-after-sync";
import { JOB_POLL_INTERVAL_MS, mapJob, syncJobKey } from "./useSyncJobs";

/** Stop waiting after this long; the job itself is not cancelled. */
const JOB_POLL_TIMEOUT_MS = 60 * 60 * 1000;

export type IntegrationSource = "intervals_icu";
export type SyncFrequency = "hourly" | "daily" | "manual";

export interface IntegrationSettings {
  sync_frequency: SyncFrequency;
  auto_sync: boolean;
}

export interface IntegrationStatus {
  id: IntegrationSource;
  name: string;
  status: "connected" | "disconnected" | "unknown";
  last_sync: string | null;
  athlete_id?: string;
  athlete_name?: string;
  error_count: number;
  settings: IntegrationSettings;
  last_sync_status?: string | null;
  last_sync_error?: string | null;
  last_sync_detail?: Record<string, unknown> | null;
  staleness_bucket?: "fresh" | "stale" | "missing" | "unknown";
}

interface IntegrationsState {
  intervals_icu: IntegrationStatus | null;
}

const SYNC_FREQUENCIES: readonly SyncFrequency[] = [
  "hourly",
  "daily",
  "manual",
];

function mapToStatus(
  raw: Generated.IntegrationResponseOutput,
  source: IntegrationSource,
): IntegrationStatus {
  const settings = raw.settings ?? {};
  const detail = raw.last_sync_detail;
  return {
    id: source,
    name: getSourceDefinition(source)?.display_name ?? source,
    status: raw.connected ? "connected" : "disconnected",
    last_sync: raw.last_sync_at ?? null,
    athlete_id: raw.data_as_of ?? undefined,
    error_count: 0,
    settings: {
      sync_frequency: narrowToLiteral(
        settings.sync_frequency,
        SYNC_FREQUENCIES,
        "daily",
      ),
      auto_sync: settings.auto_sync ?? true,
    },
    last_sync_status: raw.last_sync_status ?? null,
    last_sync_error: raw.last_sync_error ?? null,
    last_sync_detail:
      detail !== null && detail !== undefined && typeof detail === "object"
        ? (detail as Record<string, unknown>)
        : null,
    staleness_bucket: narrowToLiteral(
      raw.staleness_bucket,
      ["fresh", "stale", "missing", "unknown"] as const,
      "unknown",
    ),
  };
}

function emptyStatus(id: IntegrationSource): IntegrationStatus {
  return {
    id,
    name: getSourceDefinition(id)?.display_name ?? id,
    status: "disconnected",
    last_sync: null,
    error_count: 0,
    settings: { sync_frequency: "daily", auto_sync: true },
    last_sync_status: null,
    last_sync_error: null,
    last_sync_detail: null,
    staleness_bucket: "missing",
  };
}

interface ConnectPayload {
  athlete_id?: string;
  api_key?: string;
  code?: string;
}

function integrationKey(source: IntegrationSource) {
  return [`/integrations/${source}`, {}] as const;
}

function fetchIntegration(source: IntegrationSource) {
  return callOrvalValidated(
    (f) => getIntegrationApiV1IntegrationsSourceGet(source, {}, f),
    Generated.IntegrationResponse,
  ).then((raw) => mapToStatus(raw, source));
}

const SOURCES: readonly IntegrationSource[] = ["intervals_icu"];

/** Counters the sync toast reports once a job reaches a terminal state. */
export interface SyncJobSummary {
  status: "success" | "failed" | "cancelled";
  upserted: number;
  deduplicated: number;
  total_processed: number;
  streamsInserted: number;
  wellnessDays: number;
  error: string | null;
}

/**
 * Follow a job until it settles, updating the cached job on every poll.
 *
 * Progress lives in the job row, so this only has to read it: the same numbers
 * the data page shows come from the same place, and a job still running after a
 * page reload is picked up again by ``useSyncJob``.
 */
async function pollJobUntilSettled(
  source: IntegrationSource,
  jobId: string,
  mutate: ReturnType<typeof useSWRConfig>["mutate"],
): Promise<SyncJobSummary> {
  const deadline = Date.now() + JOB_POLL_TIMEOUT_MS;
  while (Date.now() < deadline) {
    await new Promise<void>((resolve) => {
      setTimeout(resolve, JOB_POLL_INTERVAL_MS);
    });
    const raw = await callOrvalValidated(
      (f) => currentSyncJobApiV1IntegrationsSourceJobsCurrentGet(source, {}, f),
      Generated.SyncJobResponse.nullable(),
    );
    if (raw !== null && raw.id === jobId) {
      await mutate(syncJobKey(source), mapJob(raw), { revalidate: false });
    }
    const status = raw?.status ?? null;
    if (status === "success" || status === "failed" || status === "cancelled") {
      const upserted = raw?.activities_upserted ?? 0;
      const deduplicated = raw?.activities_deduplicated ?? 0;
      return {
        status,
        upserted,
        deduplicated,
        total_processed: upserted + deduplicated,
        streamsInserted: raw?.streams_inserted ?? 0,
        wellnessDays: raw?.wellness_days ?? 0,
        error: raw?.error ?? null,
      };
    }
  }
  // The job keeps running server-side; the data page shows its live progress,
  // so the caller only needs to stop waiting rather than report a failure.
  throw new Error("同步仍在进行，可在数据页查看进度");
}



export function useIntegrations() {
  const { mutate } = useSWRConfig();
  const intervalsIcu = useSWR<IntegrationStatus>(integrationKey("intervals_icu"), {
    shouldRetryOnError: false,
    fetcher: () => fetchIntegration("intervals_icu"),
  });
  const integrations: IntegrationsState = {
    intervals_icu: intervalsIcu.data ?? emptyStatus("intervals_icu"),
  };

  const reload = useCallback(async () => {
    await Promise.all(SOURCES.map((s) => mutate(integrationKey(s))));
  }, [mutate]);

  const connectIntegration = useCallback(
    async (source: IntegrationSource, payload: ConnectPayload) => {
      const request: Generated.ConnectIntegrationRequest = {
        athlete_id: payload.athlete_id ?? null,
        api_key: payload.api_key ?? null,
        code: payload.code ?? null,
      };
      const data = await callOrvalValidated(
        (f) => connectIntegrationApiV1IntegrationsSourceConnectPut(source, request, {}, f),
        Generated.IntegrationResponse,
      );
      await invalidateDataCards(mutate, source);
      return mapToStatus(data, source);
    },
    [mutate],
  );

  const disconnectIntegration = useCallback(
    async (source: IntegrationSource, clearData = false) => {
      await callOrval((f) =>
        disconnectIntegrationApiV1IntegrationsSourceDisconnectDelete(
          source,
          { clear_data: clearData },
          {},
          f,
        ),
      );
      await invalidateDataCards(mutate, source);
    },
    [mutate],
  );

  const syncIntegration = useCallback(
    async (source: IntegrationSource): Promise<SyncJobSummary> => {
      const accepted = await callOrvalValidated(
        (f) => syncIntegrationApiV1IntegrationsSourceSyncPost(source, {}, f),
        Generated.SyncJobResponse,
      );
      await invalidateDataCards(mutate, source);
      const finished = await pollJobUntilSettled(source, accepted.id, mutate);
      await invalidateDataCards(mutate, source);
      return finished;
    },
    [mutate],
  );

  const updateIntegrationSettings = useCallback(
    async (source: IntegrationSource, settings: IntegrationSettings) => {
      const body: Generated.IntegrationSettingsUpdate = {
        sync_frequency: settings.sync_frequency,
        auto_sync: settings.auto_sync,
      };
      const data = await callOrvalValidated(
        (f) => updateSettingsApiV1IntegrationsSourceSettingsPut(source, body, {}, f),
        Generated.IntegrationResponse,
      );
      await mutate(integrationKey(source));
      return mapToStatus(data, source);
    },
    [mutate],
  );

  return {
    integrations,
    loading: intervalsIcu.isLoading,
    error: intervalsIcu.error?.message ?? null,
    reload,
    connectIntegration,
    disconnectIntegration,
    syncIntegration,
    updateIntegrationSettings,
  };
}
