"use client";

import { useEffect, useState } from "react";
import { Card } from "@shared/ui/Card";
import { apiFetch } from "@shared/lib/api";

interface ExerciseSet {
  id: number;
  set_number: number;
  weight_kg: number | null;
  reps: number | null;
  rpe: number | null;
  estimated_1rm_kg: number | null;
}

interface Exercise {
  id: number;
  activity_id: number;
  exercise_id: number;
  order_index: number;
  notes: string | null;
  name_cn: string;
  name_en: string;
  category: string | null;
  equipment: string | null;
  sets: ExerciseSet[];
}

interface StrengthDetailProps {
  activityId: string;
}

/* ── Formatters ── */

function fmtKg(v: number | null): string {
  if (v == null) return "--";
  return `${v.toFixed(1)}kg`;
}

function fmtRpe(v: number | null): string {
  if (v == null) return "--";
  return v.toFixed(1);
}

/** Tone RPE value into semantic color using design system tokens only. */
function rpeToneClass(rpe: number): string {
  if (rpe >= 9) return "text-error font-semibold";
  if (rpe >= 7.5) return "text-warning font-semibold";
  return "text-text-secondary";
}

/** Volume (weight × reps) for a single exercise. */
function exerciseVolume(ex: Exercise): number {
  return ex.sets.reduce(
    (sum, s) => sum + (s.weight_kg ?? 0) * (s.reps ?? 0),
    0,
  );
}

export function StrengthDetail({ activityId }: StrengthDetailProps) {
  const [exercises, setExercises] = useState<Exercise[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setLoading(true);
    setError(null);
    apiFetch<Exercise[]>(`/strength/workouts/${activityId}/exercises`)
      .then((data) => {
        if (!cancelled) setExercises(data);
      })
      .catch((e: unknown) => {
        if (!cancelled) setError(e instanceof Error ? e.message : "加载失败");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [activityId]);

  if (loading) {
    return (
      <Card padding="sm">
        <p className="text-caption1 text-text-muted">加载中...</p>
      </Card>
    );
  }
  if (error) {
    return (
      <Card padding="sm">
        <p className="text-caption1 text-error">{error}</p>
      </Card>
    );
  }
  if (!exercises || exercises.length === 0) {
    return (
      <Card padding="sm">
        <h2 className="mb-2 text-subheadline font-semibold text-text-secondary">动作明细</h2>
        <p className="text-caption1 text-text-muted">暂无力量数据</p>
      </Card>
    );
  }

  const totalVolume = exercises.reduce((s, ex) => s + exerciseVolume(ex), 0);
  const totalSets = exercises.reduce((s, ex) => s + ex.sets.length, 0);

  return (
    <Card padding="sm">
      {/* ── Header + session totals ── */}
      <div className="mb-4 flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="text-subheadline font-semibold text-text-secondary">动作明细</h2>
        <dl className="flex gap-4 text-caption1 text-text-muted">
          <div>
            <dt className="sr-only">动作数</dt>
            <dd>
              <span className="font-mono text-text-primary">{exercises.length}</span>
              <span className="ml-1">个动作</span>
            </dd>
          </div>
          <div>
            <dt className="sr-only">总组数</dt>
            <dd>
              <span className="font-mono text-text-primary">{totalSets}</span>
              <span className="ml-1">组</span>
            </dd>
          </div>
          <div>
            <dt className="sr-only">总训练量</dt>
            <dd>
              <span className="font-mono font-semibold text-text-primary">
                {totalVolume.toFixed(0)}
              </span>
              <span className="ml-1">kg 总量</span>
            </dd>
          </div>
        </dl>
      </div>

      {/* ── Exercise list ── */}
      <div className="flex flex-col gap-3">
        {exercises.map((ex, idx) => (
          <ExerciseBlock key={ex.id} ex={ex} idx={idx} />
        ))}
      </div>
    </Card>
  );
}

/* ── Single exercise sub-block ── */

function ExerciseBlock({ ex, idx }: { ex: Exercise; idx: number }) {
  const volume = exerciseVolume(ex);
  const displayName = ex.name_cn || ex.name_en;
  const showSubtitle = ex.name_cn && ex.name_en && ex.name_cn !== ex.name_en;

  return (
    <section className="rounded-md border border-border-subtle bg-surface-overlay/50 p-3">
      {/* Exercise header */}
      <div className="mb-2 flex flex-wrap items-baseline gap-x-2 gap-y-1">
        <span className="rounded-sm border border-border-subtle bg-surface-raised px-1.5 py-0.5 font-mono text-caption2 text-text-muted">
          {String(idx + 1).padStart(2, "0")}
        </span>
        <h3 className="text-subheadline font-semibold text-text-primary">{displayName}</h3>
        {showSubtitle && (
          <span className="text-caption1 text-text-muted">{ex.name_en}</span>
        )}
        {ex.category && (
          <span className="ml-auto rounded-sm bg-surface-sunken px-1.5 py-0.5 text-caption2 text-text-muted uppercase tracking-wide">
            {ex.category}
          </span>
        )}
      </div>

      {/* Set table */}
      <div className="overflow-x-auto">
        <table className="w-full text-caption1">
          <thead>
            <tr className="border-b border-border-subtle text-left text-text-muted">
              <th className="py-1.5 pr-3 font-medium">组</th>
              <th className="px-2 py-1.5 font-medium">重量</th>
              <th className="px-2 py-1.5 font-medium">次数</th>
              <th className="px-2 py-1.5 font-medium">RPE</th>
              <th className="px-2 py-1.5 font-medium">e1RM</th>
            </tr>
          </thead>
          <tbody className="font-mono text-text-secondary">
            {ex.sets.map((set) => (
              <tr
                key={set.id}
                className="border-b border-border-subtle/40 last:border-0"
              >
                <td className="py-1.5 pr-3 font-sans text-text-primary">
                  {set.set_number}
                </td>
                <td className="px-2 py-1.5">{fmtKg(set.weight_kg)}</td>
                <td className="px-2 py-1.5">{set.reps ?? "--"}</td>
                <td className="px-2 py-1.5">
                  {set.rpe != null ? (
                    <span className={rpeToneClass(set.rpe)}>{fmtRpe(set.rpe)}</span>
                  ) : (
                    "--"
                  )}
                </td>
                <td className="px-2 py-1.5">{fmtKg(set.estimated_1rm_kg)}</td>
              </tr>
            ))}
            {ex.sets.length === 0 && (
              <tr>
                <td
                  colSpan={5}
                  className="py-2 text-center font-sans text-caption1 text-text-muted"
                >
                  无分组数据
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {/* Per-exercise volume footer */}
      <div className="mt-2 flex justify-end border-t border-border-subtle/60 pt-2">
        <span className="text-caption1 text-text-muted">
          该动作总量
          <span className="ml-1.5 font-mono font-semibold text-text-primary">
            {volume.toFixed(0)}kg
          </span>
        </span>
      </div>
    </section>
  );
}
