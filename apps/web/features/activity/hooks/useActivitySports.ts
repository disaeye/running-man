"use client";

import useSWR from "swr";
import { callOrvalValidated } from "@shared/api/orval-adapter";
import { getActivityStatsApiV1ActivitiesStatsGet } from "@shared/api/generated/clients";
import * as Generated from "@shared/api/generated/model";
import { PRODUCT_SPORTS } from "@shared/config/sport-config";

/**
 * 数据里实际存在的训练类型（产品范围内），注册表顺序。
 *
 * 类型下拉的分类列表以账户真实数据为准：全期 by_sport 里出现过的
 * 跑步/力量家族类型才进下拉。数据里从没出现过的类型（比如越野跑）
 * 不列——筛选列表与数据一致，选出来的类型必有记录。
 */
export function useActivitySports(): readonly string[] {
  const { data } = useSWR<readonly string[]>(
    ["/activities/stats", "sports"],
    {
      fetcher: async () => {
        const stats = await callOrvalValidated(
          (f) => getActivityStatsApiV1ActivitiesStatsGet(undefined, {}, f),
          Generated.ActivityStatsResponse,
        );
        const present = new Set(stats.by_sport.map((row) => row.sport));
        return PRODUCT_SPORTS.filter((sport) => present.has(sport.key)).map((sport) => sport.key);
      },
    },
  );
  return data ?? [];
}
