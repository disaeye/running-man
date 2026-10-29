"use client";

import { Card } from "@shared/ui/Card";
import { useStrengthActivityDetail } from "@features/activity/hooks/useStrengthActivityDetail";

function setVolume(weight: number | null, reps: number): number {
  return (weight ?? 0) * reps;
}

export function StrengthDetail({ activityId }: { readonly activityId: string }) {
  const { exercises, loading, error } = useStrengthActivityDetail(activityId);

  if (loading) {
    return (
      <Card padding="md" data-testid="strength-analysis-loading-detail">
        <p className="text-caption1 text-text-muted" role="status" aria-busy="true">
          正在读取动作和组数据…
        </p>
      </Card>
    );
  }
  if (error) {
    return (
      <Card padding="md" role="alert">
        <p className="text-subheadline text-error">动作组数据加载失败</p>
        <p className="mt-1 text-caption1 text-text-secondary">{error}</p>
      </Card>
    );
  }
  if (exercises.length === 0) {
    return (
      <Card padding="md" data-testid="strength-exercise-empty">
        <h3 className="text-caption1 font-semibold text-text-secondary">动作明细</h3>
        <p className="mt-2 text-caption1 text-text-muted">这次训练没有记录动作组。</p>
      </Card>
    );
  }

  const allSets = exercises.flatMap((exercise) => exercise.sets);
  const completedSets = allSets.filter((set) => set.completed);
  const totalVolume = completedSets.reduce(
    (sum, set) => sum + setVolume(set.weight_kg, set.reps),
    0,
  );
  const estimatedRecords = exercises.flatMap((exercise) =>
    exercise.sets.flatMap((set) =>
      !set.completed || set.estimated_1rm_kg == null
        ? []
        : [
            {
              key: `${exercise.id}-${set.id}`,
              exercise: exercise.name_cn || exercise.name_en || "未命名动作",
              setNumber: set.set_number,
              estimated1rm: set.estimated_1rm_kg,
            },
          ],
    ),
  );

  return (
    <Card padding="md" data-testid="strength-session-analysis-detail">
      <div className="flex flex-wrap items-baseline justify-between gap-3">
        <h3 className="text-title3 font-semibold text-text-primary">动作与组数据</h3>
        <dl className="flex flex-wrap gap-x-4 gap-y-1 text-caption1 text-text-muted">
          <div><dt className="sr-only">动作数</dt><dd>{exercises.length} 个动作</dd></div>
          <div><dt className="sr-only">总组数</dt><dd>{allSets.length} 组</dd></div>
          <div><dt className="sr-only">完成组数</dt><dd>{completedSets.length} / {allSets.length} 组</dd></div>
          <div><dt className="sr-only">总训练量</dt><dd className="font-mono tabular-nums text-text-secondary">{Math.round(totalVolume).toLocaleString()} kg 总量</dd></div>
        </dl>
      </div>

      <div className="mt-4 space-y-5">
        {exercises.map((exercise) => {
          const name = exercise.name_cn || exercise.name_en || "未命名动作";
          return (
            <section key={exercise.id} className="space-y-2" aria-label={name}>
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <h4 className="text-subheadline font-semibold text-text-primary">{name}</h4>
                <span className="text-caption1 text-text-muted">
                  {[exercise.category, exercise.equipment].filter(Boolean).join(" · ")}
                </span>
              </div>
              {exercise.sets.length > 0 ? (
                <div className="overflow-x-auto">
                  <table className="w-full text-caption1">
                    <thead>
                      <tr className="border-b border-border-subtle text-left text-text-muted">
                        <th className="py-2 pr-2 font-medium">组</th>
                        <th className="px-2 py-2 font-medium">重量</th>
                        <th className="px-2 py-2 font-medium">次数</th>
                        <th className="px-2 py-2 font-medium">RPE</th>
                        <th className="px-2 py-2 font-medium">e1RM</th>
                        <th className="px-2 py-2 font-medium">状态</th>
                        <th className="py-2 pl-2 text-right font-medium">训练量</th>
                      </tr>
                    </thead>
                    <tbody className="font-mono tabular-nums text-text-secondary">
                      {exercise.sets.map((set) => (
                        <tr key={set.id} className="border-b border-border-subtle/40 last:border-0">
                          <td className="py-2 pr-2 font-sans text-text-primary">{set.set_number}</td>
                          <td className="px-2 py-2">{set.weight_kg == null ? "未记录" : `${set.weight_kg.toFixed(1)} kg`}</td>
                          <td className="px-2 py-2">{set.reps}</td>
                          <td className="px-2 py-2">{set.rpe == null ? "未记录" : set.rpe.toFixed(1)}</td>
                          <td className="px-2 py-2">{set.estimated_1rm_kg == null ? "未记录" : `${set.estimated_1rm_kg.toFixed(1)} kg`}</td>
                          <td className="px-2 py-2">{set.completed ? "已完成" : "未完成"}</td>
                          <td className="py-2 pl-2 text-right">{set.completed ? `${setVolume(set.weight_kg, set.reps).toFixed(0)} kg` : "未计入"}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : (
                <p className="text-caption1 text-text-muted">这个动作没有组数据。</p>
              )}
              {exercise.notes ? <p className="text-caption1 text-text-muted">{exercise.notes}</p> : null}
            </section>
          );
        })}
      </div>

      {estimatedRecords.length > 0 ? (
        <section className="mt-5 border-t border-border-subtle pt-4" aria-label="本次估算最大力量">
          <h3 className="text-caption1 font-semibold text-text-secondary">本次 e1RM</h3>
          <ul className="mt-2 grid grid-cols-1 gap-x-5 gap-y-1 sm:grid-cols-2">
            {estimatedRecords.map((record) => (
              <li key={record.key} className="flex items-center justify-between gap-3 text-caption1">
                <span className="text-text-secondary">{record.exercise} · 第 {record.setNumber} 组</span>
                <span className="font-mono tabular-nums text-text-primary">{record.estimated1rm.toFixed(1)} kg</span>
              </li>
            ))}
          </ul>
        </section>
      ) : null}
    </Card>
  );
}
