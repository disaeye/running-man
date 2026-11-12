"use client";

import useSWR from "swr";
import { callOrvalValidated } from "@shared/api/orval-adapter";
import { listClassificationsApiV1ActivitiesClassificationsGet } from "@shared/api/generated/clients";
import * as Generated from "@shared/api/generated/model";

export type SessionClassificationItem = Generated.SessionClassificationResponseOutput;

export interface UseSessionClassificationsResult {
  byActivityId: ReadonlyMap<string, SessionClassificationItem>;
  loading: boolean;
  error: string | null;
  reload: () => void;
}

/** Backend five-object classification results, keyed by activity id. */
export function useSessionClassifications(
  from?: string,
  to?: string,
): UseSessionClassificationsResult {
  const params = { from, to };
  const { data, error, isLoading, mutate } = useSWR(
    ["/activities/classifications", from ?? "", to ?? ""],
    {
      fetcher: () =>
        callOrvalValidated(
          (f) => listClassificationsApiV1ActivitiesClassificationsGet(params, {}, f),
          Generated.ClassificationListResponse,
        ),
      revalidateOnFocus: false,
    },
  );

  const byActivityId = new Map<string, SessionClassificationItem>();
  for (const item of data?.results ?? []) {
    byActivityId.set(item.session_classification.activity_id, item);
  }
  return {
    byActivityId,
    loading: isLoading,
    error: error?.message ?? null,
    reload: () => void mutate(),
  };
}
