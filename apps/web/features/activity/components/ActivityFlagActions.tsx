"use client";

import { useState } from "react";
import { EyeOff, Eye, Trash2, RotateCcw } from "lucide-react";
import { useActivityFlagging } from "@features/activity/hooks/useActivityFlagging";

/**
 * 单条活动的忽略和删除操作。
 *
 * 忽略和删除的作用不同，操作前会说明各自的结果：
 *
 * - 忽略会保留活动记录，但不计入跑步统计、最佳成绩与心率区间分析。
 * - 删除会将活动移入回收站并从列表隐藏；后续同步不会重新导入，之后可以恢复。
 *
 * 按钮标题会说明操作结果。
 */
export function ActivityFlagActions({
  activityId,
  onDone,
}: {
  activityId: string;
  onDone?: () => void;
}) {
  const { ignore, remove, pending, error } = useActivityFlagging();
  const [confirmingDelete, setConfirmingDelete] = useState(false);

  const after = async (ok: boolean) => {
    if (ok) onDone?.();
  };

  return (
    <div className="flex flex-wrap items-center gap-2">
      <button
        type="button"
        disabled={pending}
        title="保留在活动列表中，但不计入跑步统计、最佳成绩与心率区间分析"
        onClick={() => void ignore(activityId).then(after)}
        className="inline-flex h-10 items-center gap-1.5 rounded-2xl border border-border/70 bg-card/60 px-3 text-caption1 font-medium text-muted-foreground transition-colors hover:bg-card hover:text-foreground disabled:opacity-50"
      >
        <EyeOff className="h-3.5 w-3.5" aria-hidden="true" />
        <span>忽略</span>
      </button>

      {confirmingDelete ? (
        <span className="inline-flex min-h-10 items-center gap-2 rounded-xl border border-error/40 bg-error/10 px-3 text-caption1">
          <span className="text-error">移入回收站？</span>
          <button
            type="button"
            disabled={pending}
            onClick={() => void remove(activityId).then(after)}
            className="inline-flex min-h-10 items-center font-semibold text-error underline underline-offset-2 disabled:opacity-50"
          >
            确认
          </button>
          <button
            type="button"
            onClick={() => setConfirmingDelete(false)}
            className="inline-flex min-h-10 items-center text-muted-foreground underline underline-offset-2"
          >
            取消
          </button>
        </span>
      ) : (
        <button
          type="button"
          disabled={pending}
          title="移入回收站：从列表隐藏，且同步不会再次导入。可恢复。"
          onClick={() => setConfirmingDelete(true)}
          className="inline-flex h-10 items-center gap-1.5 rounded-2xl border border-border/70 bg-card/60 px-3 text-caption1 font-medium text-muted-foreground transition-colors hover:border-error/40 hover:bg-error/10 hover:text-error disabled:opacity-50"
        >
          <Trash2 className="h-3.5 w-3.5" aria-hidden="true" />
          <span>删除</span>
        </button>
      )}

      {error && (
        <span role="alert" className="text-xs text-error">
          {error}
        </span>
      )}
    </div>
  );
}

/** Restores an activity from the trash or returns an ignored one to the numbers. */
export function ActivityRestoreActions({
  activityId,
  mode,
  onDone,
}: {
  activityId: string;
  mode: "trash" | "ignored";
  onDone?: () => void;
}) {
  const { restore, unignore, pending } = useActivityFlagging();
  const action = mode === "trash" ? restore : unignore;
  const label = mode === "trash" ? "恢复" : "取消忽略";
  const Icon = mode === "trash" ? RotateCcw : Eye;

  return (
    <button
      type="button"
      disabled={pending}
      onClick={() => void action(activityId).then((ok) => ok && onDone?.())}
      className="inline-flex items-center gap-1.5 rounded-lg border border-border/70 bg-card/60 px-2.5 py-1 text-xs font-medium text-muted-foreground transition-colors hover:bg-card hover:text-foreground disabled:opacity-50"
    >
      <Icon className="h-3 w-3" aria-hidden="true" />
      {label}
    </button>
  );
}
