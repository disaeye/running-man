"use client";

import { useCallback, useState } from "react";
import { useSWRConfig } from "swr";
import { invalidateDataCards } from "@features/data/lib/invalidate-after-sync";
import { callOrval } from "@shared/api/orval-adapter";
import { apiErrorMessage } from "@shared/lib/api";
import {
  deleteActivityApiV1ActivitiesActivityIdDelete,
  updateRaceFlagApiV1ActivitiesActivityIdRacePatch,
  ignoreActivitiesBulkApiV1ActivitiesIgnorePost,
  ignoreActivityApiV1ActivitiesActivityIdIgnorePost,
  restoreActivityApiV1ActivitiesActivityIdRestorePost,
  unignoreActivityApiV1ActivitiesActivityIdIgnoreDelete,
} from "@shared/api/generated/clients";

/**
 * 活动标记操作会更新活动列表、跑步统计、最佳成绩和心率区间分析。
 * 忽略会保留活动记录，删除会将活动移入回收站，之后都可以恢复。
 * 每次操作都会清理相关缓存，让页面读取最新统计。
 */

export interface UseActivityFlaggingResult {
  pending: boolean;
  error: string | null;
  ignore: (activityId: string) => Promise<boolean>;
  unignore: (activityId: string) => Promise<boolean>;
  remove: (activityId: string) => Promise<boolean>;
  restore: (activityId: string) => Promise<boolean>;
  ignoreMany: (activityIds: string[], ignored: boolean) => Promise<boolean>;
  setRace: (activityId: string, isRace: boolean) => Promise<boolean>;
}

export function useActivityFlagging(): UseActivityFlaggingResult {
  const { mutate } = useSWRConfig();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const invalidate = useCallback(async () => {
    await invalidateDataCards(mutate);
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
        setError(apiErrorMessage(err, failure));
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
    setRace: (id, isRace) =>
      run(
        () => callOrval((f) => updateRaceFlagApiV1ActivitiesActivityIdRacePatch(id, { is_race: isRace }, {}, f)),
        "更新活动分类失败",
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
