"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { apiFetch } from "@shared/lib/api";
import { Card } from "@shared/ui/Card";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@shared/ui/dialog";
import { Badge } from "@shared/ui/Badge";
import { StrengthWorkoutEditor } from "@features/strength/components/StrengthWorkoutEditor";
import { getSportConfig } from "@shared/config/sport-config";
import type { ActivitySummary } from "@shared/types/activity";
import type { WorkoutExercise } from "@shared/types/strength";

const STRENGTH_SPORTS = new Set(["Workout", "WeightTraining"]);

interface WorkoutData {
  activity: ActivitySummary;
  exercises: WorkoutExercise[];
}

function isoDate(iso: string): string {
  const d = new Date(iso);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${dd}`;
}

function totalVolume(exes: WorkoutExercise[]): number {
  return exes.reduce(
    (s, ex) => s + ex.sets.reduce((s2, set) => s2 + (set.weight_kg ?? 0) * set.reps, 0),
    0,
  );
}

function StrengthCard({ data }: { data: WorkoutData }) {
  const { activity, exercises } = data;
  const vol = totalVolume(exercises);
  const nSets = exercises.reduce((s, ex) => s + ex.sets.length, 0);
  const label = getSportConfig(activity.sport).label;

  return (
    <Card padding="md" className="flex flex-col gap-3">
      <div className="flex items-center justify-between gap-2">
        <span className="text-subheadline font-semibold text-text-primary">
          {isoDate(activity.start_time)}
        </span>
        <Badge variant="info">{label}</Badge>
      </div>

      {exercises.length === 0 ? (
        <p className="text-caption1 text-text-muted">暂无数据</p>
      ) : (
        <ul className="flex flex-col gap-1">
          {exercises.map((ex) => {
            const name = ex.name_cn ?? ex.name_en ?? "—";
            const first = ex.sets[0];
            const summary = first
              ? `${first.weight_kg ?? "?"}kg × ${first.reps} × ${ex.sets.length}组`
              : "—";
            return (
              <li
                key={ex.id}
                className="flex items-center justify-between gap-2 text-caption1"
              >
                <span className="truncate text-text-secondary">{name}</span>
                <span className="shrink-0 font-mono text-text-muted">{summary}</span>
              </li>
            );
          })}
        </ul>
      )}

      {(nSets > 0 || vol > 0) && (
        <div className="flex gap-3 border-t border-border-subtle pt-2 text-caption1 text-text-muted">
          {nSets > 0 && <span>{nSets} 组</span>}
          {vol > 0 && <span className="font-mono">{vol.toFixed(0)} kg</span>}
        </div>
      )}
    </Card>
  );
}

export function StrengthTabContent() {
  const [editorOpen, setEditorOpen] = useState(false);
  const [workouts, setWorkouts] = useState<WorkoutData[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [refreshKey, setRefreshKey] = useState(0);

  useEffect(() => {
    let cancelled = false;
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setLoading(true);
    setError(null);

    const to = new Date();
    const from = new Date();
    from.setDate(from.getDate() - 60);

    (async () => {
      try {
        const acts = await apiFetch<ActivitySummary[]>("/activities", {
          params: {
            from: from.toISOString().slice(0, 10),
            to: to.toISOString().slice(0, 10),
          },
        });
        if (cancelled) return;

        const strength = acts
          .filter((a) => STRENGTH_SPORTS.has(a.sport))
          .slice(0, 4);

        if (strength.length === 0) {
          setWorkouts([]);
        } else {
          const results = await Promise.all(
            strength.map(async (act) => {
              try {
                const exercises = await apiFetch<WorkoutExercise[]>(
                  `/strength/workouts/${act.activity_id}/exercises`,
                );
                return { activity: act, exercises };
              } catch {
                return { activity: act, exercises: [] };
              }
            }),
          );
          if (!cancelled) setWorkouts(results);
        }
      } catch (err: unknown) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : "获取数据失败");
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => { cancelled = true; };
  }, [refreshKey]);

  const handleSaved = useCallback(() => {
    setEditorOpen(false);
    setRefreshKey((k) => k + 1);
  }, []);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12 text-subheadline text-text-muted">
        加载中...
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex flex-col items-center justify-center gap-2 py-12 text-subheadline">
        <p className="text-text-primary">加载失败</p>
        <p className="text-text-muted">{error}</p>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      {workouts.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-12 text-subheadline text-text-muted">
          <p>暂无力量训练记录</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          {workouts.map((w) => (
            <StrengthCard key={w.activity.activity_id} data={w} />
          ))}
        </div>
      )}

      <div className="flex items-center justify-between border-t border-border-subtle pt-4">
        <button
          type="button"
          onClick={() => setEditorOpen(true)}
              className="focus-ring inline-flex min-h-[44px] items-center rounded-md bg-accent px-4 text-subheadline font-semibold text-on-accent transition-opacity hover:opacity-90"
        >
          + 新增训练
        </button>
        <Link
          href="/settings?section=strength"
          className="focus-ring rounded px-1 text-subheadline font-medium text-accent-strong hover:underline"
        >
          动作库
        </Link>
      </div>

      <Dialog open={editorOpen} onOpenChange={setEditorOpen}>
        <DialogContent className="max-h-[calc(100dvh-2rem)] overflow-y-auto sm:max-w-lg">
          <DialogHeader><DialogTitle>新增力量训练</DialogTitle></DialogHeader>
          <StrengthWorkoutEditor
            onSaved={handleSaved}
            onClose={() => setEditorOpen(false)}
          />
        </DialogContent>
      </Dialog>
    </div>
  );
}
