"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Page, PageCard } from "@shared/ui/Lovable";
import { Button } from "@shared/ui/button";
import { apiErrorMessage } from "@shared/lib/api";
import { saveStrengthWorkout } from "../lib/strength-session-save";
import { useExercises, type Exercise } from "@features/strength/hooks/useExercises";
import { useStrengthAnalytics } from "@features/strength/hooks/useStrengthAnalytics";
import { listStrengthActivitiesApiV1StrengthWorkoutsGet } from "@shared/api/generated/clients";
import { callOrvalValidated } from "@shared/api/orval-adapter";
import * as Generated from "@shared/api/generated/model";
import { z } from "zod";
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
  const [workoutDate, setWorkoutDate] = useState(() => formatLocalDate(new Date()));
  const [workoutName, setWorkoutName] = useState("力量训练");
  const [durationMin, setDurationMin] = useState<number | null>(45);
  const [drafts, setDrafts] = useState<DraftExercise[]>([]);
  const [notes, setNotes] = useState("");
  const [saving, setSaving] = useState(false);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);

  const { data: exercises, loading: exercisesLoading } = useExercises();
  const analytics = useStrengthAnalytics();

  useEffect(() => {
    let cancelled = false;
    const today = new Date();
    const past = new Date(today);
    past.setDate(past.getDate() - 90);

    void callOrvalValidated(
      (fetchFn) =>
        listStrengthActivitiesApiV1StrengthWorkoutsGet(
          {
            from_date: past.toISOString().slice(0, 10),
            to_date: today.toISOString().slice(0, 10),
          },
          {},
          fetchFn,
        ),
      z.array(Generated.StrengthActivityResponse),
    ).then((activities) => {
      if (cancelled || activities.length === 0) return;
      const latest = activities[0];
      if (!latest) return;
      if (latest.name) setWorkoutName(latest.name);
      if (latest.start_time) {
        setWorkoutDate(latest.start_time.slice(0, 10));
      }
      if (latest.duration_s) {
        setDurationMin(Math.round(latest.duration_s / 60));
      }
    }).catch(() => undefined);

    return () => {
      cancelled = true;
    };
  }, []);

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
          <p className="text-sm font-medium text-accent-strong">{statusMessage}</p>
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
