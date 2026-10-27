"use client";

import { useCallback } from "react";
import useSWR, { useSWRConfig } from "swr";
import { apiFetch } from "@shared/lib/api";

/**
 * 比赛成绩：录入、列表、删除。
 *
 * 成绩是等级评定的唯一输入，后端按它算大众选手等级与年龄分级，首页身份条
 * 读的就是那个结果。所以写入或删除之后必须同时 revalidate 两个 key——
 * 只刷成绩列表会让首页继续显示旧的等级，而那条等级来自一场已经被删掉的比赛。
 */

/** 等级评定只认这四个项目，与 `contracts/v1/grading.yaml` 一致。 */
export const RACE_DISTANCE_CATEGORIES = ["5k", "10k", "half", "marathon"] as const;

export type RaceDistanceCategory = (typeof RACE_DISTANCE_CATEGORIES)[number];

export interface RaceResult {
  id: string;
  athlete_id: string;
  event_name: string;
  distance_category: RaceDistanceCategory;
  time_s: number;
  race_date: string;
  a1_certified: boolean;
  activity_id: string | null;
  created_at: string;
}

export interface RaceResultDraft {
  event_name: string;
  distance_category: RaceDistanceCategory;
  time_s: number;
  race_date: string;
  a1_certified: boolean;
}

interface UseRaceResultsResult {
  data: RaceResult[];
  loading: boolean;
  error: string | null;
  create: (draft: RaceResultDraft) => Promise<void>;
  remove: (id: string) => Promise<void>;
  reload: () => void;
}

const RACE_RESULTS = ["/race-results", {}];
const ATHLETE_GRADE = ["/insights/athlete-grade", {}];

export function useRaceResults(): UseRaceResultsResult {
  const { data, error, isLoading, mutate } = useSWR<RaceResult[]>(
    RACE_RESULTS,
    {
      fetcher: () => apiFetch<RaceResult[]>("/race-results"),
    },
  );
  const { mutate: mutateCache } = useSWRConfig();

  const revalidateAfterWrite = useCallback(async () => {
    await Promise.all([mutateCache(RACE_RESULTS), mutateCache(ATHLETE_GRADE)]);
  }, [mutateCache]);

  const create = useCallback(
    async (draft: RaceResultDraft) => {
      await apiFetch<RaceResult>("/race-results", {
        method: "POST",
        body: JSON.stringify(draft),
      });
      await revalidateAfterWrite();
    },
    [revalidateAfterWrite],
  );

  const remove = useCallback(
    async (id: string) => {
      await apiFetch<void>(`/race-results/${id}`, { method: "DELETE" });
      await revalidateAfterWrite();
    },
    [revalidateAfterWrite],
  );

  return {
    data: data ?? [],
    loading: isLoading,
    error: error?.message ?? null,
    create,
    remove,
    reload: () => void mutate(),
  };
}
