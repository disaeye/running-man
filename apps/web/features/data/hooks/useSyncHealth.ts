"use client";

import useSWR from "swr";
import { callOrvalValidated } from "@shared/api/orval-adapter";
import {

  listIntegrationsApiV1IntegrationsGet,
} from "@shared/api/generated/clients";
import * as Generated from "@shared/api/generated/model";

/**
 * Real sync health, for the shell's status indicator.
 *
 * The indicator previously read nothing at all and always showed a green
 * "同步链路正常" dot — while the database's newest activity could be weeks old
 * and the last sync could have failed. An indicator that cannot be wrong is
 * worse than no indicator: it teaches the athlete to trust a stale dashboard.
 *
 * States, in order of how much they should worry the athlete:
 *   not_connected  — nothing to sync from yet
 *   failing        — the most recent attempt failed
 *   empty          — connected, but no activity has ever arrived
 *   stale          — connected, succeeding, but the newest data is old
 *   ok             — connected, succeeding, recent
 *   unknown        — the check itself could not run
 */
export type SyncHealthState =
  | "ok"
  | "stale"
  | "empty"
  | "failing"
  | "not_connected"
  | "unknown";

export interface SyncHealth {
  state: SyncHealthState;
  /** Athlete-facing label; never a bare boolean. */
  label: string;
  /** ISO date of the newest synced activity, when known. */
  dataAsOf: string | null;
  /** Days since the newest activity; null when there is no data at all. */
  daysSinceData: number | null;
  loading: boolean;
}

/** Connected but nothing synced yet reads differently from "no source". */
const HEALTH_LABEL: Record<SyncHealthState, string> = {
  ok: "同步正常",
  stale: "最新数据较早",
  empty: "已连接，尚未同步",
  failing: "上次同步失败",
  not_connected: "未连接数据源",
  unknown: "同步状态未知",
};

function daysBetween(iso: string, now: Date): number | null {
  const then = new Date(`${iso}T00:00:00Z`);
  if (Number.isNaN(then.getTime())) return null;
  const diff = now.getTime() - then.getTime();
  return Math.floor(diff / 86_400_000);
}

export function useSyncHealth(): SyncHealth {
  const { data, error, isLoading } = useSWR<SyncHealth>(
    // A cache key, not an endpoint: the fetcher derives health from the
    // integrations list and the sync-run history.
    ["sync-health-derived"],
    {
      shouldRetryOnError: false,
      fetcher: async () => {
        const list = await callOrvalValidated(
          (f) => listIntegrationsApiV1IntegrationsGet({}, f),
          Generated.IntegrationResponse.array(),
        );
        const connected = list.filter((row) => row.connected);
        if (connected.length === 0) {
          return {
            state: "not_connected" as const,
            label: HEALTH_LABEL.not_connected,
            dataAsOf: null,
            daysSinceData: null,
            loading: false,
          };
        }
        const failing = connected.find((row) => row.last_sync_status === "failed");
        if (failing) {
          return {
            state: "failing" as const,
            label: HEALTH_LABEL.failing,
            dataAsOf: null,
            daysSinceData: null,
            loading: false,
          };
        }
        const freshest = connected
          .map((row) => row.data_as_of)
          .filter((value): value is string => Boolean(value))
          .sort()
          .at(-1) ?? null;
        if (!freshest) {
          return {
            state: "empty" as const,
            label: HEALTH_LABEL.empty,
            dataAsOf: null,
            daysSinceData: null,
            loading: false,
          };
        }
        // The bucket comes from the API so the shell, the data page and the
        // Today page cannot each apply their own idea of "old".
        const bucket = connected.find((row) => row.data_as_of === freshest)?.staleness_bucket;
        const days = daysBetween(freshest, new Date());
        if (bucket !== "fresh") {
          return {
            state: "stale" as const,
            // The age is the whole message: "5 天前" says what happened, where
            // "数据已过期" only says the app disapproves.
            label: days == null ? HEALTH_LABEL.stale : `最新数据 ${days} 天前`,
            dataAsOf: freshest,
            daysSinceData: days,
            loading: false,
          };
        }
        return {
          state: "ok" as const,
          label: HEALTH_LABEL.ok,
          dataAsOf: freshest,
          daysSinceData: days,
          loading: false,
        };
      },
    },
  );

  if (error) {
    return {
      state: "unknown",
      label: HEALTH_LABEL.unknown,
      dataAsOf: null,
      daysSinceData: null,
      loading: false,
    };
  }
  if (isLoading || !data) {
    return {
      state: "unknown",
      label: HEALTH_LABEL.unknown,
      dataAsOf: null,
      daysSinceData: null,
      loading: true,
    };
  }
  return data;
}
