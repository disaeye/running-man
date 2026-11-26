"use client";

import { useCallback, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useSWRConfig } from "swr";
import { PageCard } from "@shared/ui/Card";
import { Segmented } from "@shared/ui/SegmentedControl";
import { Button } from "@shared/ui/button";
import { useToast } from "@shared/ui/Toast";
import { apiErrorMessage } from "@shared/lib/api";
import { activityDetailUrl, resolveStrengthTab, strengthTabUrl, type StrengthTabId } from "@shared/config/training-nav";
import { parseCalendarDateParam } from "@features/calendar/lib/calendar-url-state";
import { invalidateDataCards } from "@features/data/lib/invalidate-after-sync";
import { saveStrengthWorkout } from "../lib/strength-session-save";
import {
  computeSessionTotals,
  computeSquatE1rm,
  createDraftId,
  createEmptySet,
  formatLocalDate,
} from "../lib/strength-draft-helpers";
import { useExercises, type Exercise } from "@features/strength/hooks/useExercises";
import { useStrengthAnalytics } from "@features/strength/hooks/useStrengthAnalytics";
import { StrengthSessionMetaCard } from "./StrengthSessionMetaCard";
import { StrengthExerciseLibraryCard } from "./StrengthExerciseLibraryCard";
import { StrengthExerciseCard } from "./StrengthExerciseCard";
import { StrengthAnalyticsSection } from "./StrengthAnalyticsSection";
import { StrengthTabContent } from "./StrengthTabContent";
import type { DraftExercise, DraftSet } from "./StrengthWorkoutEditorParts";

export function StrengthSessionEditor() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const { mutate } = useSWRConfig();
  const { toast } = useToast();
  const mode = resolveStrengthTab(searchParams.get("tab"));
  const linkedDate = parseCalendarDateParam(searchParams.get("date"));
  const returnTo = searchParams.size ? `/strength?${searchParams}` : "/strength";
  const [dateDraft, setDateDraft] = useState(() => ({ linkedDate, value: linkedDate ?? formatLocalDate(new Date()) }));
  if (dateDraft.linkedDate !== linkedDate) {
    setDateDraft({ linkedDate, value: linkedDate ?? formatLocalDate(new Date()) });
  }
  const workoutDate = dateDraft.value;
  const [workoutName, setWorkoutName] = useState("力量训练");
  const [drafts, setDrafts] = useState<DraftExercise[]>([]);
  const [notes, setNotes] = useState("");
  const [saving, setSaving] = useState(false);
  const [savedActivityId, setSavedActivityId] = useState<string | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [historyRefresh, setHistoryRefresh] = useState(0);

  const { data: exercises, loading: exercisesLoading } = useExercises();
  const analytics = useStrengthAnalytics();
  const selectedIds = useMemo(() => new Set(drafts.map((d) => d.exercise.id)), [drafts]);

  const handleSelectExercise = useCallback((exercise: Exercise) => {
    setSavedActivityId(null);
    setDrafts((prev) => {
      if (prev.some((item) => item.exercise.id === exercise.id)) return prev;
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

  const handleDuplicateLastSet = useCallback((draftId: string) => {
    setDrafts((prev) => prev.map((item) => {
      if (item.id !== draftId) return item;
      const last = item.sets.at(-1);
      const cloned: DraftSet = last ? { ...last, id: createDraftId(), completed: false } : createEmptySet("60");
      return { ...item, sets: [...item.sets, cloned] };
    }));
  }, []);

  const handleRemoveSet = useCallback((draftId: string, setId: string) => {
    setDrafts((prev) =>
      prev.map((item) =>
        item.id === draftId && item.sets.length > 1
          ? { ...item, sets: item.sets.filter((s) => s.id !== setId) }
          : item,
      ),
    );
  }, []);

  const handleUpdateSet = useCallback(
    (draftId: string, setId: string, field: keyof DraftSet, value: string | boolean) => {
      setDrafts((prev) =>
        prev.map((item) =>
          item.id === draftId
            ? { ...item, sets: item.sets.map((s) => (s.id === setId ? { ...s, [field]: value } : s)) }
            : item,
        ),
      );
    },
    [],
  );

  const sessionTotals = useMemo(() => computeSessionTotals(drafts), [drafts]);
  const squatCurrentE1rm = useMemo(() => computeSquatE1rm(drafts), [drafts]);

  const switchMode = useCallback(
    (next: StrengthTabId) => router.replace(strengthTabUrl(next, linkedDate), { scroll: false }),
    [router, linkedDate],
  );

  const handleSave = async () => {
    if (drafts.length === 0) {
      setErrorMsg("请至少添加一个训练动作");
      return;
    }
    const hasValidSet = drafts.some((d) => d.sets.some((s) => parseInt(s.reps, 10) > 0));
    if (!hasValidSet) {
      setErrorMsg("请至少为一个动作填写大于 0 的完成次数");
      return;
    }
    setSaving(true);
    setErrorMsg(null);
    setSavedActivityId(null);
    try {
      const activityId = await saveStrengthWorkout({
        date: workoutDate,
        name: workoutName,
        notes,
        drafts,
      });
      setDrafts([]);
      setNotes("");
      setSavedActivityId(activityId);
      setHistoryRefresh((k) => k + 1);
      toast("力量训练记录已保存", "success");
      await invalidateDataCards(mutate);
    } catch (err: unknown) {
      setErrorMsg(apiErrorMessage(err, "保存训练失败"));
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-4" data-testid="strength-workspace">
      <Segmented
        options={[
          { value: "log" as const, label: "记录训练" },
          { value: "analytics" as const, label: "历史与分析" },
        ]}
        value={mode}
        onChange={switchMode}
      />

        {mode === "log" ? (
          <div className="view-swap space-y-4">
            <StrengthSessionMetaCard
              workoutName={workoutName}
              workoutDate={workoutDate}
              notes={notes}
              onNameChange={setWorkoutName}
              onDateChange={(value) => setDateDraft({ linkedDate, value })}
              onNotesChange={setNotes}
            />

            <StrengthExerciseLibraryCard
              exercises={exercises}
              loading={exercisesLoading}
              selectedIds={selectedIds}
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
                <StrengthExerciseCard key={draft.id} draft={draft} onAddSet={handleAddSet} onDuplicateLastSet={handleDuplicateLastSet} onRemoveExercise={handleRemoveExercise} onRemoveSet={handleRemoveSet} onUpdateSet={handleUpdateSet} />
              ))
            )}

            {errorMsg ? <p role="alert" className="text-sm font-medium text-error">{errorMsg}</p> : null}
            {savedActivityId ? (
              <div role="status" className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-success/30 bg-success/10 p-3 text-subheadline text-success">
                <span>训练记录已保存</span>
                <div className="flex items-center gap-3">
                  <button type="button" onClick={() => switchMode("analytics")} className="min-h-10 text-caption1 font-medium underline underline-offset-4">查看趋势分析</button>
                  <Link href={activityDetailUrl(savedActivityId, returnTo)} className="inline-flex min-h-10 items-center font-medium underline underline-offset-4">查看本次详情 →</Link>
                </div>
              </div>
            ) : null}

            <div className="sticky bottom-[calc(var(--mobile-nav-height,64px)+0.5rem)] z-20 flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-border-default bg-surface-raised p-3 shadow-panel">
              {sessionTotals.exercises > 0 ? (
                <div className="num font-mono text-caption1 tabular-nums text-text-secondary" data-testid="strength-draft-summary">
                  已选 {sessionTotals.exercises} 个动作 · {sessionTotals.sets} 组 · 累计容量 {sessionTotals.volume} kg{squatCurrentE1rm != null ? ` · 深蹲预估 e1RM ${squatCurrentE1rm} kg` : ""}
                </div>
              ) : <span className="text-caption1 text-text-muted">添加动作与组次后保存本次训练</span>}
              <Button onClick={() => void handleSave()} disabled={saving} className="min-h-[44px] min-w-[120px] font-medium">
                {saving ? "保存中…" : "保存训练"}
              </Button>
            </div>
          </div>
        ) : (
          <div className="view-swap space-y-4">
            <StrengthAnalyticsSection
              muscleVolume={analytics.muscleVolume}
              distribution={analytics.distribution}
              e1rm={analytics.e1rm}
              currentSquatE1rm={squatCurrentE1rm}
            />
            <PageCard title="近 60 天力量记录">
              <StrengthTabContent key={historyRefresh} returnTo={returnTo} />
            </PageCard>
          </div>
        )}
    </div>
  );
}
