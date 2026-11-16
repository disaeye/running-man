"use client";

import { useCallback, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Page, PageCard } from "@shared/ui/Lovable";
import { Button } from "@shared/ui/button";
import { apiErrorMessage } from "@shared/lib/api";
import { saveStrengthWorkout } from "../lib/strength-session-save";
import { useExercises, type Exercise } from "@features/strength/hooks/useExercises";
import { useStrengthAnalytics } from "@features/strength/hooks/useStrengthAnalytics";
import { StrengthExerciseLibraryCard } from "./StrengthExerciseLibraryCard";
import { StrengthExerciseCard } from "./StrengthExerciseCard";
import { StrengthMuscleLoad } from "./StrengthMuscleLoad";
import { StrengthSquatTrend } from "./StrengthSquatTrend";
import type { DraftExercise, DraftSet } from "./StrengthWorkoutEditorParts";

let draftSequence = 0;
const createDraftId = () => `draft-${++draftSequence}`;

function createEmptySet(defaultWeight = "60"): DraftSet {
  return {
    id: createDraftId(),
    weight_kg: defaultWeight,
    reps: "10",
    rpe: "8",
    completed: true,
  };
}

function formatLocalDate(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

export function StrengthSessionEditor() {
  const router = useRouter();
  // 不预填上一次训练：挂载落在今天，存错日的根源在预填。
  const [workoutDate] = useState(() => formatLocalDate(new Date()));
  const [workoutName] = useState("力量训练");
  const [durationMin] = useState<number | null>(45);
  const [drafts, setDrafts] = useState<DraftExercise[]>([]);
  const [notes, setNotes] = useState("");
  const [saving, setSaving] = useState(false);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);

  const { data: exercises, loading: exercisesLoading } = useExercises();
  const analytics = useStrengthAnalytics();

  const handleSelectExercise = useCallback((exercise: Exercise) => {
    setDrafts((prev) => {
      const exists = prev.find((item) => item.exercise.id === exercise.id);
      if (exists) return prev;
      return [
        ...prev,
        {
          id: createDraftId(),
          exercise,
          sets: [createEmptySet(exercise.category === "腿" ? "60" : "40")],
        },
      ];
    });
  }, []);

  const handleRemoveExercise = useCallback((draftId: string) => {
    setDrafts((prev) => prev.filter((item) => item.id !== draftId));
  }, []);

  const handleAddSet = useCallback((draftId: string) => {
    setDrafts((prev) =>
      prev.map((item) => {
        if (item.id !== draftId) return item;
        const last = item.sets[item.sets.length - 1];
        return {
          ...item,
          sets: [...item.sets, createEmptySet(last?.weight_kg || "60")],
        };
      }),
    );
  }, []);

  const handleRemoveSet = useCallback((draftId: string, setId: string) => {
    setDrafts((prev) =>
      prev.map((item) =>
        item.id === draftId
          ? { ...item, sets: item.sets.filter((s) => s.id !== setId) }
          : item,
      ),
    );
  }, []);

  const handleUpdateSet = useCallback(
    (draftId: string, setId: string, field: keyof DraftSet, value: string | boolean) => {
      setDrafts((prev) =>
        prev.map((item) => {
          if (item.id !== draftId) return item;
          return {
            ...item,
            sets: item.sets.map((set) =>
              set.id === setId ? { ...set, [field]: value } : set,
            ),
          };
        }),
      );
    },
    [],
  );

  const squatCurrentE1rm = useMemo(() => {
    const squatDraft = drafts.find((d) => d.exercise.name_cn.includes("深蹲"));
    if (!squatDraft) return null;
    let peak = 0;
    for (const s of squatDraft.sets) {
      const weight = parseFloat(s.weight_kg);
      const reps = parseInt(s.reps, 10);
      if (weight > 0 && reps >= 1 && reps <= 10) {
        const est = weight * (1 + reps / 30);
        if (est > peak) peak = est;
      }
    }
    return peak > 0 ? peak : null;
  }, [drafts]);

  const handleSave = async () => {
    if (drafts.length === 0) {
      setStatusMessage("请至少添加一个训练动作");
      return;
    }
    setSaving(true);
    setStatusMessage(null);
    try {
      await saveStrengthWorkout({
        date: workoutDate,
        name: workoutName,
        notes,
        drafts,
      });
      setStatusMessage("训练记录已保存");
    } catch (err: unknown) {
      setStatusMessage(apiErrorMessage(err, "保存训练失败"));
    } finally {
      setSaving(false);
    }
  };

  const eyebrowText = `${workoutDate}${durationMin ? ` · ${durationMin} 分钟` : ""}`;

  return (
    <Page
      back
      onBack={() => router.back()}
      eyebrow={eyebrowText}
      title={workoutName}
    >
      <div className="space-y-4">
        <StrengthExerciseLibraryCard
          exercises={exercises}
          loading={exercisesLoading}
          onSelectExercise={handleSelectExercise}
        />

        {drafts.length === 0 ? (
          <PageCard>
            <p className="py-6 text-center text-sm text-muted-foreground">
              当前训练尚未添加动作，可从上方动作库点击添加常用动作。
            </p>
          </PageCard>
        ) : (
          drafts.map((draft) => (
            <StrengthExerciseCard
              key={draft.id}
              draft={draft}
              onAddSet={handleAddSet}
              onRemoveExercise={handleRemoveExercise}
              onRemoveSet={handleRemoveSet}
              onUpdateSet={handleUpdateSet}
            />
          ))
        )}

        <StrengthMuscleLoad data={analytics.muscleVolume} />

        <StrengthSquatTrend currentE1rm={squatCurrentE1rm} />

        <PageCard title="训练备注">
          <textarea
            value={notes}
            onChange={(event) => setNotes(event.target.value)}
            placeholder="RPE、酸痛感受、动作要领…"
            rows={3}
            className="w-full resize-none rounded-lg bg-secondary p-3 text-sm text-foreground outline-none focus:ring-1 focus:ring-primary"
          />
        </PageCard>

        {statusMessage ? (
          <p
            role="status"
            className={`text-sm font-medium ${
              statusMessage.includes("失败") || statusMessage.includes("请至少")
                ? "text-error"
                : "text-accent-strong"
            }`}
          >
            {statusMessage}
          </p>
        ) : null}

        <div className="flex justify-end pt-2">
          <Button
            onClick={() => void handleSave()}
            disabled={saving}
            className="min-h-[44px] min-w-[120px] font-medium"
          >
            {saving ? "保存中…" : "保存训练"}
          </Button>
        </div>
      </div>
    </Page>
  );
}
