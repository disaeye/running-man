"use client";

import useSWR from "swr";
import { callOrvalValidated } from "@shared/api/orval-adapter";
import { getActivityStatsApiV1ActivitiesStatsGet } from "@shared/api/generated/clients";
import * as Generated from "@shared/api/generated/model";

export interface UseLifetimeTotalsResult {
  /** 全期累计里程，接口字段是 `total_distance_m`。没有记录时是 null，不是 0。 */
  distance_m: number | null;
  /** 全期活动条数。同上，缺记录写 null，「没练过」和「练了 0 次」不是一回事。 */
  activity_count: number | null;
  loading: boolean;
  error: string | null;
}

/**
 * 全期汇总（累计里程与活动条数）。
 *
 * 不带 from / to，让接口把整段历史一起算——首页身份条要的是「一共跑了多少」，
 * 任何时间窗口切出来的都不是这个数。`by_sport` 也在响应里，但首页只读合计，
 * 所以在这里收成两个标量，免得每个调用方各减一遍。
 *
 * 走 `callOrvalValidated`：接口返回的是聚合结果，字段缺一个就会让累计里程
 * 静默变成 0，用生成的 schema 在边界上拦一次。
 */
export function useLifetimeTotals(): UseLifetimeTotalsResult {
  const { data, error, isLoading } = useSWR<Generated.ActivityStatsResponseOutput>(
    ["/activities/stats", {}],
    {
      fetcher: () =>
        callOrvalValidated(
          (f) => getActivityStatsApiV1ActivitiesStatsGet(undefined, {}, f),
          Generated.ActivityStatsResponse,
        ),
    },
  );

  return {
    distance_m: data?.total_distance_m ?? null,
    activity_count: data?.activity_count ?? null,
    loading: isLoading,
    error: error?.message ?? null,
  };
}
