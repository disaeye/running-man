"use client";

import { useMemo } from "react";
import { PageCard, Tag } from "@shared/ui/Lovable";
import type { DraftExercise, DraftSet } from "./StrengthWorkoutEditorParts";

interface StrengthExerciseCardProps {
  draft: DraftExercise;
  onAddSet: (draftId: string) => void;
  onRemoveExercise: (draftId: string) => void;
  onRemoveSet: (draftId: string, setId: string) => void;
  onUpdateSet: (
    draftId: string,
    setId: string,
    field: keyof DraftSet,
    value: string | boolean,
  ) => void;
}

export function StrengthExerciseCard({
  draft,
  onAddSet,
  onRemoveExercise,
  onRemoveSet,
  onUpdateSet,
}: StrengthExerciseCardProps) {
  const e1rm = useMemo(() => {
    let peak = 0;
    for (const item of draft.sets) {
      const weight = parseFloat(item.weight_kg);
      const reps = parseInt(item.reps, 10);
      if (weight > 0 && reps >= 1 && reps <= 10) {
        const estimated = weight * (1 + reps / 30);
        if (estimated > peak) peak = estimated;
      }
    }
    return peak > 0 ? Math.round(peak) : null;
  }, [draft.sets]);

  return (
    <PageCard
      title={draft.exercise.name_cn}
      action={
        <div className="flex items-center gap-2">
          {e1rm ? (
            <Tag tone="warn">{`e1RM ≈ ${e1rm} kg（估算）`}</Tag>
          ) : (
            <Tag>{draft.exercise.category}</Tag>
          )}
          <button
            type="button"
            onClick={() => onRemoveExercise(draft.id)}
            className="text-xs text-muted-foreground hover:text-destructive"
          >
            移除
          </button>
        </div>
      }
    >
      <div className="space-y-2">
        {draft.sets.map((set, setIndex) => (
          <div
            key={set.id}
            className="num flex items-center gap-3 rounded-lg bg-secondary px-3 py-2 text-sm"
          >
            <span className="w-12 text-xs text-muted-foreground">
              第{setIndex + 1}组
            </span>
            <div className="flex flex-1 items-center gap-1">
              <input
                type="number"
                min="1"
                step="1"
                value={set.reps}
                onChange={(event) =>
                  onUpdateSet(draft.id, set.id, "reps", event.target.value)
                }
                placeholder="10"
                aria-label={`第 ${setIndex + 1} 组次数`}
                className="w-16 rounded border bg-background px-2 py-1 text-right text-sm"
              />
              <span className="text-xs text-muted-foreground">次</span>
            </div>
            <div className="flex flex-1 items-center gap-1">
              <input
                type="number"
                min="0"
                step="0.5"
                value={set.weight_kg}
                onChange={(event) =>
                  onUpdateSet(draft.id, set.id, "weight_kg", event.target.value)
                }
                placeholder="60"
                aria-label={`第 ${setIndex + 1} 组重量`}
                className="w-16 rounded border bg-background px-2 py-1 text-right text-sm"
              />
              <span className="text-xs text-muted-foreground">kg</span>
            </div>
            <button
              type="button"
              onClick={() => onRemoveSet(draft.id, set.id)}
              className="text-xs text-muted-foreground hover:text-destructive"
              aria-label="删除此组"
            >
              ×
            </button>
          </div>
        ))}
      </div>
      <div className="mt-3 flex items-center justify-between text-xs">
        <button
          type="button"
          onClick={() => onAddSet(draft.id)}
          className="text-accent-strong hover:underline"
        >
          + 加一组
        </button>
        <span className="text-muted-foreground">{draft.sets.length} 组</span>
      </div>
    </PageCard>
  );
}
