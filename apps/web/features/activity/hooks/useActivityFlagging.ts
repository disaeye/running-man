"use client";

import { useCallback, useState } from "react";
import { useSWRConfig } from "swr";
import { callOrval } from "@shared/api/orval-adapter";
import {
  deleteActivityApiV1ActivitiesActivityIdDelete,
  ignoreActivitiesBulkApiV1ActivitiesIgnorePost,
  ignoreActivityApiV1ActivitiesActivityIdIgnorePost,
  restoreActivityApiV1ActivitiesActivityIdRestorePost,
  unignoreActivityApiV1ActivitiesActivityIdIgnoreDelete,
} from "@shared/api/generated/clients";

/**
 * Ignore, un-ignore, delete and restore activities.
 *
 * Ignoring keeps an activity visible but out of the numbers (load, PMC,
 * records, zone statistics). Deletion hides it and stops the sync from
 * bringing it back. Both are reversible, so neither is behind a confirmation
 * dialog beyond what the row already communicates.
 *
 * Every mutation invalidates the same cache keys: the server recomputes
 * derived facts, so anything reading load or PMC is now stale.
 */

/** Cache keys that go stale when an activity stops counting. */
const AFFECTED_KEYS = [
  "/activities",
  "/pmc",
  "/insights/coach-context",
  "/insights/zones",
  "/data/health",
  "/data/quality",
  "/insights/intensity-distribution",
  "/insights/personal-records",
];

export interface UseActivityFlaggingResult {
  pending: boolean;
  error: string | null;
  ignore: (activityId: string) => Promise<boolean>;
  unignore: (activityId: string) => Promise<boolean>;
  remove: (activityId: string) => Promise<boolean>;
  restore: (activityId: string) => Promise<boolean>;
  ignoreMany: (activityIds: string[], ignored: boolean) => Promise<boolean>;
}

export function useActivityFlagging(): UseActivityFlaggingResult {
  const { mutate } = useSWRConfig();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const invalidate = useCallback(async () => {
    // Prefix match so every parameterised variant is refreshed ("/activities?
    // from=…&to=…" as well as "/activities").
    await Promise.all(
      AFFECTED_KEYS.map((key) =>
        mutate(
          (cacheKey) =>
            typeof cacheKey === "string"
              ? cacheKey.startsWith(key)
              : Array.isArray(cacheKey) &&
                typeof cacheKey[0] === "string" &&
                cacheKey[0].startsWith(key),
        ),
      ),
    );
  }, [mutate]);

  const run = useCallback(
    async (action: () => Promise<unknown>, failure: string): Promise<boolean> => {
      setPending(true);
      setError(null);
      try {
        await action();
        await invalidate();
        return true;
      } catch (err: unknown) {
        setError(err instanceof Error ? err.message : failure);
        return false;
      } finally {
        setPending(false);
      }
    },
    [invalidate],
  );

  return {
    pending,
    error,
    ignore: (id) =>
      run(
        () => callOrval((f) => ignoreActivityApiV1ActivitiesActivityIdIgnorePost(id, {}, f)),
        "忽略失败",
      ),
    unignore: (id) =>
      run(
        () => callOrval((f) => unignoreActivityApiV1ActivitiesActivityIdIgnoreDelete(id, {}, f)),
        "取消忽略失败",
      ),
    remove: (id) =>
      run(
        () =>
          // Soft delete: the row moves to the trash and can be restored.
          callOrval((f) => deleteActivityApiV1ActivitiesActivityIdDelete(id, {}, f)),
        "删除失败",
      ),
    restore: (id) =>
      run(
        () => callOrval((f) => restoreActivityApiV1ActivitiesActivityIdRestorePost(id, {}, f)),
        "恢复失败",
      ),
    ignoreMany: (ids, ignored) =>
      run(
        () =>
          callOrval((f) =>
            ignoreActivitiesBulkApiV1ActivitiesIgnorePost({ activity_ids: ids, ignored }, {}, f),
          ),
        "批量操作失败",
      ),
  };
}
