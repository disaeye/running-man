"use client";

import useSWR from "swr";
import { callOrvalValidated } from "@shared/api/orval-adapter";
import {
  listAdjustmentsApiV1PlanAdjustmentsGet,
} from "@shared/api/generated/clients";
import * as Generated from "@shared/api/generated/model";

export interface PlanAdjustment {
  readonly adjustment_id: string;
  readonly event_id: string;
  readonly trigger_type: string;
  readonly trigger_summary: string;
  /** 负荷变化（百分比）。负数表示削减。 */
  readonly load_delta_pct: number;
  readonly status: "pending" | "applied" | "reverted";
  readonly created_at: string;
  readonly triggers: readonly {
    readonly key: string;
    readonly label: string;
    readonly detail: string;
  }[];
}

/**
 * 计划调整建议。
 *
 * 建议先到，课表后改：接口返回的是待确认的条目，运动员点「应用调整」
 * 之后课表的处方才会被改写。
 */
export function usePlanAdjustments(): {
  data: readonly PlanAdjustment[];
  loading: boolean;
  error: string | null;
  reload: () => void;
} {
  const { data, error, isLoading, mutate } = useSWR<
    Generated.AdjustmentListResponseOutput
  >(["/plan/adjustments", {}], {
    fetcher: (): Promise<Generated.AdjustmentListResponseOutput> =>
      callOrvalValidated(
        (f) => listAdjustmentsApiV1PlanAdjustmentsGet({}, {}, f),
        Generated.AdjustmentListResponse,
      ),
  });

  const adjustments = (data?.adjustments ?? []).map((item) => ({
    adjustment_id: item.adjustment_id,
    event_id: item.event_id,
    trigger_type: item.trigger_type,
    trigger_summary: item.trigger_summary,
    load_delta_pct: item.load_delta_pct ?? 0,
    status: (item.status ?? "pending") as PlanAdjustment["status"],
    created_at: item.created_at ?? "",
    triggers: (item.triggers ?? []).map((trigger) => ({
      key: trigger.key,
      label: trigger.label,
      detail: trigger.detail,
    })),
  }));

  return {
    data: adjustments,
    loading: isLoading,
    error: error?.message ?? null,
    reload: () => void mutate(),
  };
}
