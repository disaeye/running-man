"use client";

import { useCallback, useMemo, useState } from "react";
import { apiFetch } from "@shared/lib/api";
import { useExercises, type Exercise } from "@features/strength/hooks/useExercises";
import {
  DraftExerciseList,
  ExercisePickerOverlay,
  type DraftExercise,
  type DraftSet,
} from "./StrengthWorkoutEditorParts";

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */

interface StrengthWorkoutEditorProps {
  /** Called after successful save. */
  onSaved?: () => void;
  /** Called when user cancels or closes. */
  onClose?: () => void;
}

/* ------------------------------------------------------------------ */
/*  Helpers                                                            */
/* ------------------------------------------------------------------ */

function todayStr(): string {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

let uid = 0;
const newId = (): string => `draft-${++uid}`;

function emptySet(): DraftSet {
  return { id: newId(), weight_kg: "", reps: "8", rpe: "" };
}

/* ------------------------------------------------------------------ */
/*  Component                                                          */
/* ------------------------------------------------------------------ */

export function StrengthWorkoutEditor({
  onSaved,
  onClose,
}: StrengthWorkoutEditorProps) {
  const [date, setDate] = useState(todayStr());
  const [name, setName] = useState("");
  const [drafts, setDrafts] = useState<DraftExercise[]>([]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  /* Exercise picker state */
  const [pickerOpen, setPickerOpen] = useState(false);
  const [pickerQuery, setPickerQuery] = useState("");
  const { data: exercises, loading: pickerLoading } =
    useExercises(pickerQuery);

  /* ------ Handlers ------ */

  const addExercise = useCallback((ex: Exercise) => {
    setDrafts((prev) => [
      ...prev,
      { id: newId(), exercise: ex, sets: [emptySet()] },
    ]);
    setPickerOpen(false);
    setPickerQuery("");
  }, []);

  const removeExercise = useCallback((draftId: string) => {
    setDrafts((prev) => prev.filter((d) => d.id !== draftId));
  }, []);

  const addSetToExercise = useCallback((draftId: string) => {
    setDrafts((prev) =>
      prev.map((d) =>
        d.id === draftId ? { ...d, sets: [...d.sets, emptySet()] } : d,
      ),
    );
  }, []);

  const removeSet = useCallback((draftId: string, setId: string) => {
    setDrafts((prev) =>
      prev.map((d) =>
        d.id === draftId
          ? { ...d, sets: d.sets.filter((s) => s.id !== setId) }
          : d,
      ),
    );
  }, []);

  const updateSet = useCallback(
    (draftId: string, setId: string, field: keyof DraftSet, value: string) => {
      setDrafts((prev) =>
        prev.map((d) =>
          d.id === draftId
            ? {
                ...d,
                sets: d.sets.map((s) =>
                  s.id === setId ? { ...s, [field]: value } : s,
                ),
              }
            : d,
        ),
      );
    },
    [],
  );

  /* ------ Validation ------ */

  const validationError = useMemo(() => {
    if (drafts.length === 0) return "至少添加一个动作";
    for (const d of drafts) {
      if (d.sets.length === 0) return `${d.exercise.name_cn} 至少需要一组训练`;
    }
    return null;
  }, [drafts]);

  /* ------ Save ------ */

  const handleSave = useCallback(async () => {
    if (validationError || saving) return;
    setSaving(true);
    setError(null);

    try {
      // 1. Create the workout
      const { activity_id } = await apiFetch<{ activity_id: string }>(
        "/strength/workouts",
        {
          method: "POST",
          body: JSON.stringify({
            date,
            name: name.trim() || null,
          }),
        },
      );

      // 2. Add exercises sequentially (need returned IDs for sets)
      for (let i = 0; i < drafts.length; i++) {
        const draft = drafts[i]!;
        const ex = await apiFetch<{ id: number }>(
          `/strength/workouts/${activity_id}/exercises`,
          {
            method: "POST",
            body: JSON.stringify({
              exercise_id: draft.exercise.id,
              order_index: i,
            }),
          },
        );

        // 3. Add sets sequentially
        for (let j = 0; j < draft.sets.length; j++) {
          const s = draft.sets[j]!;
          const weight = parseFloat(s.weight_kg);

          await apiFetch(`/strength/workout-exercises/${ex.id}/sets`, {
            method: "POST",
            body: JSON.stringify({
              set_number: j + 1,
              weight_kg: Number.isNaN(weight) || weight < 0 ? null : weight,
              reps: Math.max(1, parseInt(s.reps) || 1),
              rpe: s.rpe ? parseFloat(s.rpe) : null,
            }),
          });
        }
      }

      onSaved?.();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "保存失败");
    } finally {
      setSaving(false);
    }
  }, [date, name, drafts, validationError, saving, onSaved]);

  /* ------ Render ------ */

  return (
    <div className="flex flex-col gap-5">
      {/* Date + Name */}
      <div className="grid grid-cols-2 gap-3">
        <div className="flex flex-col gap-1.5">
          <label className="text-caption1 font-medium text-text-muted">日期</label>
          <input
            type="date"
            value={date}
            onChange={(e) => setDate(e.target.value)}
            className="focus-ring rounded-md border border-border-subtle bg-surface-overlay px-3 py-2 text-subheadline text-text-primary hover:border-border-default focus:border-accent focus:outline-none transition-colors"
          />
        </div>
        <div className="flex flex-col gap-1.5">
          <label className="text-caption1 font-medium text-text-muted">名称</label>
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="例如：上肢力量"
            className="focus-ring rounded-md border border-border-subtle bg-surface-overlay px-3 py-2 text-subheadline text-text-primary placeholder:text-text-muted hover:border-border-default focus:border-accent focus:outline-none transition-colors"
          />
        </div>
      </div>

      <DraftExerciseList
        drafts={drafts}
        onAddSet={addSetToExercise}
        onRemoveExercise={removeExercise}
        onRemoveSet={removeSet}
        onUpdateSet={updateSet}
      />

      {/* Add exercise button */}
      <button
        type="button"
        onClick={() => setPickerOpen(true)}
        className="focus-ring inline-flex items-center gap-2 rounded-lg border border-dashed border-border-strong px-4 py-3 text-subheadline font-medium text-text-secondary hover:bg-surface-overlay hover:text-text-primary transition-colors"
      >
        <svg
          className="h-4 w-4"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2.5"
          strokeLinecap="round"
        >
          <path d="M12 5v14M5 12h14" />
        </svg>
        添加动作
      </button>

      {/* Error */}
      {error && (
        <p className="rounded-md bg-error/10 px-3 py-2 text-subheadline text-error">
          {error}
        </p>
      )}

      {/* Actions */}
      <div className="flex items-center justify-between border-t border-border-subtle pt-4">
        <button
          type="button"
          onClick={onClose}
          className="focus-ring rounded-md px-4 py-2 text-subheadline font-medium text-text-secondary hover:bg-surface-overlay transition-colors"
        >
          取消
        </button>
        <button
          type="button"
          onClick={handleSave}
          disabled={saving || validationError !== null}
          className="focus-ring rounded-md bg-accent px-5 py-2 text-subheadline font-semibold text-accent-foreground hover:opacity-90 transition-opacity disabled:opacity-40"
        >
          {saving ? "保存中..." : "保存训练"}
        </button>
      </div>

      {/* Exercise picker dialog */}
      {pickerOpen && (
        <ExercisePickerOverlay
          exercises={exercises}
          loading={pickerLoading}
          query={pickerQuery}
          onQueryChange={setPickerQuery}
          onSelect={addExercise}
          onClose={() => {
            setPickerOpen(false);
            setPickerQuery("");
          }}
        />
      )}
    </div>
  );
}
