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
} from "@shared/api/generated/clients";
import { useCallback } from "react";
import { useSWRConfig } from "swr";
import { narrowToLiteral } from "@shared/lib/dto-nullable";
import { invalidateDataCards } from "@features/data/lib/invalidate-after-sync";

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

async function pollSyncUntilSettled(
  source: IntegrationSource,
  mutate: ReturnType<typeof useSWRConfig>["mutate"],
): Promise<Generated.IntegrationSyncResponse | null> {
  const deadline = Date.now() + 15 * 60 * 1000;
  while (Date.now() < deadline) {
    await new Promise<void>((resolve) => {
      setTimeout(resolve, 1500);
    });
    const raw = await callOrvalValidated(
      (f) => getIntegrationApiV1IntegrationsSourceGet(source, {}, f),
      Generated.IntegrationResponse,
    );
    await mutate(integrationKey(source), mapToStatus(raw, source), { revalidate: false });
    const status = raw.last_sync_status ?? null;
    if (status === "success") {
      const counts = (raw.last_sync_detail as { counts?: Record<string, number> } | null)?.counts;
      return {
        source,
        status: "success",
        upserted: counts?.activities_upserted ?? 0,
        deduplicated: counts?.activities_deduped ?? 0,
        total_processed:
          (counts?.activities_upserted ?? 0) + (counts?.activities_deduped ?? 0),
      };
    }
    if (status === "failed") {
      throw new Error(raw.last_sync_error ?? "同步失败");
    }
  }
  throw new Error("同步超时，请稍后刷新查看结果");
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
    async (source: IntegrationSource) => {
      await callOrval((f) =>
        disconnectIntegrationApiV1IntegrationsSourceDisconnectDelete(source, {}, f),
      );
      await invalidateDataCards(mutate, source);
    },
    [mutate],
  );

  const syncIntegration = useCallback(
    async (source: IntegrationSource) => {
      const accepted = await callOrvalValidated(
        (f) => syncIntegrationApiV1IntegrationsSourceSyncPost(source, {}, f),
        Generated.IntegrationSyncResponse,
      );
      await invalidateDataCards(mutate, source);
      const finished = await pollSyncUntilSettled(source, mutate);
      await invalidateDataCards(mutate, source);
      return finished ?? accepted;
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
