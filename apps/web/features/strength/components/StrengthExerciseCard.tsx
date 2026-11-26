"use client";

import { useMemo } from "react";
import { Trash2 } from "lucide-react";
import { PageCard } from "@shared/ui/Card";
import { Tag } from "@shared/ui/Badge";
import type { DraftExercise, DraftSet } from "./StrengthWorkoutEditorParts";

interface StrengthExerciseCardProps {
  draft: DraftExercise;
  onAddSet: (draftId: string) => void;
  onDuplicateLastSet: (draftId: string) => void;
  onRemoveExercise: (draftId: string) => void;
  onRemoveSet: (draftId: string, setId: string) => void;
  onUpdateSet: (
    draftId: string,
    setId: string,
    field: keyof DraftSet,
    value: string | boolean,
  ) => void;
}

function stepNumericValue(raw: string, delta: number, min: number, decimals: number): string {
  const base = Number.parseFloat(raw);
  const current = Number.isFinite(base) ? base : min;
  const next = Math.max(min, current + delta);
  return decimals > 0 ? String(Number(next.toFixed(decimals))) : String(Math.round(next));
}

export function StrengthExerciseCard({
  draft,
  onAddSet,
  onDuplicateLastSet,
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
            className="inline-flex min-h-11 items-center px-2 text-xs text-muted-foreground hover:text-destructive"
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
            className="num flex flex-wrap items-center gap-2 rounded-lg bg-secondary px-3 py-2 text-sm"
          >
            <span className="w-12 shrink-0 text-xs text-muted-foreground">
              第{setIndex + 1}组
            </span>
            <div className="flex min-w-0 items-center gap-1">
              <button
                type="button"
                aria-label={`第 ${setIndex + 1} 组重量减 2.5 kg`}
                onClick={() => onUpdateSet(draft.id, set.id, "weight_kg", stepNumericValue(set.weight_kg, -2.5, 0, 1))}
                className="tactile focus-ring inline-flex min-h-11 min-w-11 items-center justify-center rounded-lg border border-border-default bg-surface-card px-2 text-caption1 text-text-secondary hover:bg-surface-active"
              >
                -2.5
              </button>
              <input
                type="number"
                min="0"
                step="0.5"
                value={set.weight_kg}
                onChange={(event) => onUpdateSet(draft.id, set.id, "weight_kg", event.target.value)}
                placeholder="60"
                aria-label={`第 ${setIndex + 1} 组重量`}
                className="min-h-11 w-16 rounded border border-border-default bg-background px-2 py-1 text-right text-sm"
              />
              <button
                type="button"
                aria-label={`第 ${setIndex + 1} 组重量加 2.5 kg`}
                onClick={() => onUpdateSet(draft.id, set.id, "weight_kg", stepNumericValue(set.weight_kg, 2.5, 0, 1))}
                className="tactile focus-ring inline-flex min-h-11 min-w-11 items-center justify-center rounded-lg border border-border-default bg-surface-card px-2 text-caption1 text-text-secondary hover:bg-surface-active"
              >
                +2.5
              </button>
              <span className="text-xs text-muted-foreground">kg</span>
            </div>
            <div className="flex min-w-0 items-center gap-1">
              <button
                type="button"
                aria-label={`第 ${setIndex + 1} 组次数减 1`}
                onClick={() => onUpdateSet(draft.id, set.id, "reps", stepNumericValue(set.reps, -1, 1, 0))}
                className="tactile focus-ring inline-flex min-h-11 min-w-11 items-center justify-center rounded-lg border border-border-default bg-surface-card text-subheadline text-text-secondary hover:bg-surface-active"
              >
                −
              </button>
              <input
                type="number"
                min="1"
                step="1"
                value={set.reps}
                onChange={(event) => onUpdateSet(draft.id, set.id, "reps", event.target.value)}
                placeholder="10"
                aria-label={`第 ${setIndex + 1} 组次数`}
                className="min-h-11 w-14 rounded border border-border-default bg-background px-2 py-1 text-right text-sm"
              />
              <button
                type="button"
                aria-label={`第 ${setIndex + 1} 组次数加 1`}
                onClick={() => onUpdateSet(draft.id, set.id, "reps", stepNumericValue(set.reps, 1, 1, 0))}
                className="tactile focus-ring inline-flex min-h-11 min-w-11 items-center justify-center rounded-lg border border-border-default bg-surface-card text-subheadline text-text-secondary hover:bg-surface-active"
              >
                +
              </button>
              <span className="text-xs text-muted-foreground">次</span>
            </div>
            <div className="flex items-center gap-1">
              <input
                type="number"
                min="1"
                max="10"
                step="0.5"
                value={set.rpe}
                onChange={(event) =>
                  onUpdateSet(draft.id, set.id, "rpe", event.target.value)
                }
                placeholder="选填"
                aria-label={`第 ${setIndex + 1} 组 RPE`}
                className="min-h-10 w-14 rounded border border-border-default bg-background px-2 py-1 text-right text-xs"
              />
              <span className="text-xs text-muted-foreground">RPE</span>
            </div>
            {draft.sets.length > 1 ? (
              <button
                type="button"
                onClick={() => onRemoveSet(draft.id, set.id)}
                className="flex size-11 shrink-0 items-center justify-center rounded-md text-muted-foreground hover:text-destructive"
                aria-label={`删除第 ${setIndex + 1} 组`}
              >
                <Trash2 className="size-3.5" aria-hidden />
              </button>
            ) : (
              <span className="size-11 shrink-0" aria-hidden />
            )}
          </div>
        ))}
      </div>
      <div className="mt-3 flex flex-wrap items-center justify-between gap-2 text-xs">
        <div className="flex flex-wrap items-center gap-3">
          <button type="button" onClick={() => onAddSet(draft.id)} className="inline-flex min-h-11 items-center text-accent-strong hover:underline">
            + 加一组
          </button>
          <button type="button" onClick={() => onDuplicateLastSet(draft.id)} className="inline-flex min-h-11 items-center text-text-secondary hover:text-text-primary hover:underline">
            复制上一组
          </button>
        </div>
        <span className="text-muted-foreground">{draft.sets.length} 组</span>
      </div>
    </PageCard>
  );
}
