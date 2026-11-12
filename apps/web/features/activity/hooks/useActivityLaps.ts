"use client";

import useSWR from "swr";
import { callOrvalValidated } from "@shared/api/orval-adapter";
import { getLapsApiV1ActivitiesActivityIdLapsGet } from "@shared/api/generated/clients";
import * as Generated from "@shared/api/generated/model";
import { nn } from "@shared/lib/dto-nullable";

export interface ActivityLap {
  lap_index: number;
  start_time: string | null;
  duration_s: number | null;
  distance_m: number | null;
  avg_hr: number | null;
  max_hr: number | null;
  /** 秒/公里，接口已算好 */
  avg_pace: number | null;
  avg_power: number | null;
}

export interface UseActivityLapsResult {
  laps: ActivityLap[];
  loading: boolean;
  error: string | null;
}

/**
 * 设备或平台记录的圈。
 *
 * 与 `/analysis` 里的 `laps` 不是一回事：后者按时间或距离桶切流数据，
 * 只适合看趋势；这里的圈是来源自己分的组，间歇训练的组间休息也在里面。
 */
export function useActivityLaps(activityId: string | undefined): UseActivityLapsResult {
  const { data, error, isLoading } = useSWR<ActivityLap[]>(
    activityId ? [`/activities/${activityId}/laps`, {}] : null,
    {
      fetcher: async () => {
        if (!activityId) throw new Error("SWR guard: id required");
        const rows = await callOrvalValidated(
          (f) => getLapsApiV1ActivitiesActivityIdLapsGet(activityId, {}, f),
          Generated.LapResponse.array(),
        );
        return rows.map((row) => ({
          lap_index: row.lap_index,
          start_time: nn(row.start_time),
          duration_s: nn(row.duration_s),
          distance_m: nn(row.distance_m),
          avg_hr: nn(row.avg_hr),
          max_hr: nn(row.max_hr),
          avg_pace: nn(row.avg_pace),
          avg_power: nn(row.avg_power),
        }));
      },
    },
  );

  return {
    laps: data ?? [],
    loading: isLoading,
    error: error?.message ?? null,
  };
}
