"use client";

import { useEffect, useRef } from "react";
import useSWR, { useSWRConfig } from "swr";
import { callOrvalValidated } from "@shared/api/orval-adapter";
import { getRecomputeStatusApiV1DataRecomputeStatusGet } from "@shared/api/generated/clients";
import * as Generated from "@shared/api/generated/model";
import { invalidateDataCards } from "@features/data/lib/invalidate-after-sync";

export function useRecomputeStatus() {
  const { mutate: globalMutate } = useSWRConfig();
  const completedKey = useRef<string | null>(null);
  const { data, error, isLoading, mutate } = useSWR(
    ["/data/recompute-status", {}],
    () =>
      callOrvalValidated(
        (fetchFn) => getRecomputeStatusApiV1DataRecomputeStatusGet({}, fetchFn),
        Generated.RecomputeJobStatusResponse,
      ),
    { refreshInterval: 2000, revalidateOnFocus: true },
  );

  useEffect(() => {
    if (data?.status !== "succeeded" || !data.finished_at || !data.generation) return;
    const key = `${data.generation}:${data.finished_at}`;
    if (completedKey.current === key) return;
    completedKey.current = key;
    void invalidateDataCards(globalMutate);
  }, [data?.finished_at, data?.generation, data?.status, globalMutate]);

  return {
    status: data?.status ?? null,
    requestedAt: data?.requested_at ?? null,
    finishedAt: data?.finished_at ?? null,
    attempts: data?.attempts ?? 0,
    generation: data?.generation ?? null,
    lastError: data?.last_error ?? null,
    error: error?.message ?? null,
    loading: isLoading,
    reload: () => void mutate(),
  };
}
