"use client";

import useSWR from "swr";
import { callOrvalValidated } from "@shared/api/orval-adapter";
import { getPersonalRangeApiV1InsightsPersonalRangeGet } from "@shared/api/generated/clients";
import * as Generated from "@shared/api/generated/model";

export interface RangeFigure {
  readonly key: string;
  readonly label: string;
  readonly unit: string;
  /** 当前值。没有测到时为 null。 */
  readonly value: number | null;
  /** 窗口内的最小值与最大值。 */
  readonly minimum: number | null;
  readonly maximum: number | null;
  readonly median: number | null;
  /** 参与范围计算的观测数。 */
  readonly observations: number;
  /** 当前值在本人区间里的位置（0–100）。没有区间时为 null。 */
  readonly percent: number | null;
  /** 观测太少、区间还立不起来。 */
  readonly insufficient: boolean;
}

export interface PersonalRange {
  readonly window_start: string;
  readonly window_end: string;
  readonly window_days: number;
  readonly figures: readonly RangeFigure[];
}

/**
 * 本人区间：今天��数值在本人最近 90 天区间里的位置。
 *
 * 这里没有人群参照：产品里没有同龄分布、没有常模表。所以每个百分比的
 * 参照系是运动员自己的历史，卡片上会写明这一点。
 */
export function usePersonalRange(windowDays = 90): {
  data: PersonalRange | null;
  loading: boolean;
  error: string | null;
} {
  const { data, error, isLoading } = useSWR<PersonalRange>(
    ["/insights/personal-range", { window_days: windowDays }],
    {
      fetcher: () =>
        callOrvalValidated(
          (f) =>
            getPersonalRangeApiV1InsightsPersonalRangeGet(
              { window_days: windowDays },
              {},
              f,
            ),
          Generated.PersonalRangeResponse,
        ).then(mapPersonalRange),
    },
  );

  return {
    data: data ?? null,
    loading: isLoading,
    error: error?.message ?? null,
  };
}

/**
 * 把接口响应读成本页要用的形状。
 *
 * 接口的可选字段在这里收成显式的 null：字段缺失与值为 0 是两件事，
 * 页面前者写「未记录」，后者写 0。
 */
function mapPersonalRange(
  raw: Generated.PersonalRangeResponseOutput,
): PersonalRange {
  return {
    window_start: raw.window_start,
    window_end: raw.window_end,
    window_days: raw.window_days,
    figures: raw.figures.map((figure) => ({
      key: figure.key,
      label: figure.label,
      unit: figure.unit,
      value: figure.value ?? null,
      minimum: figure.minimum ?? null,
      maximum: figure.maximum ?? null,
      median: figure.median ?? null,
      observations: figure.observations,
      percent: figure.percent ?? null,
      insufficient: figure.insufficient,
    })),
  };
}
