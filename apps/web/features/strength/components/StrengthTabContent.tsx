"use client";

import Link from "next/link";
import useSWR from "swr";
import { activityDetailUrl } from "@shared/config/training-nav";
import { apiErrorMessage } from "@shared/lib/api";
import { callOrvalValidated } from "@shared/api/orval-adapter";
import {
  listStrengthActivitiesApiV1StrengthWorkoutsGet,
  listWorkoutExercisesApiV1StrengthWorkoutsActivityIdExercisesGet,
} from "@shared/api/generated/clients";
import * as Generated from "@shared/api/generated/model";
import { z } from "zod";
import { Card } from "@shared/ui/Card";
import { Badge } from "@shared/ui/Badge";
import { activityLocalDay, athleteRange, useAthleteTimezoneState } from "@shared/lib/training-day";
import type { WorkoutExercise } from "@shared/types/strength";
import { NO_VALUE } from "@shared/lib/use-data-state";

interface WorkoutData {
  activity: Generated.StrengthActivityResponseOutput;
  exercises: WorkoutExercise[];
}

function totalVolume(exes: WorkoutExercise[]): number {
  return exes.reduce(
    (s, ex) =>
      s +
      ex.sets
        .filter((set) => set.completed)
        .reduce((s2, set) => s2 + (set.weight_kg ?? 0) * set.reps, 0),
    0,
  );
}

function StrengthCard({ data, timezone, returnTo }: { data: WorkoutData; timezone: string; returnTo: string }) {
  const { activity, exercises } = data;
  const vol = totalVolume(exercises);
  const nSets = exercises.reduce((s, ex) => s + ex.sets.length, 0);

  return (
    <Card padding="md" className="flex flex-col gap-3">
      <div className="flex items-center justify-between gap-2">
        <Link
          href={activityDetailUrl(activity.activity_id, returnTo)}
          className="text-subheadline font-semibold text-text-primary hover:text-accent-strong hover:underline"
        >
          {activityLocalDay(activity.start_time, timezone)}{activity.name ? ` · ${activity.name}` : ""}
        </Link>
        <Badge variant={activity.has_training_content ? "success" : "neutral"}>
          {activity.has_training_content ? "已记录训练内容" : "仅活动记录"}
        </Badge>
      </div>

      {!activity.has_training_content ? (
        <p className="text-caption1 text-text-muted">这条力量活动尚未关联动作与组数。</p>
      ) : (
        <ul className="flex flex-col gap-1">
          {exercises.map((ex) => {
            const name = ex.name_cn ?? ex.name_en ?? NO_VALUE;
            const first = ex.sets[0];
            const summary = first
              ? `${first.weight_kg ?? "?"}kg × ${first.reps} × ${ex.sets.length}组`
              : NO_VALUE;
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

      {activity.duration_s != null ? (
        <p className="text-caption1 text-text-muted">时长 {Math.round(activity.duration_s / 60)} 分钟</p>
      ) : null}
      {(activity.set_count > 0 || nSets > 0 || vol > 0) && (
        <div className="flex gap-3 border-t border-border-subtle pt-2 text-caption1 text-text-muted">
          {(activity.set_count > 0 || nSets > 0) && <span>{activity.set_count || nSets} 组</span>}
          {vol > 0 && <span className="font-mono">{vol.toFixed(0)} kg</span>}
        </div>
      )}
    </Card>
  );
}

export function StrengthTabContent({ returnTo }: { readonly returnTo: string }) {
  const { timezone, resolved } = useAthleteTimezoneState();
  const { from, to } = athleteRange(60, timezone);
  const { data: workouts = [], isLoading, error: swrError } = useSWR<WorkoutData[]>(
    resolved ? ["/strength/workouts", from, to, timezone] : null,
    async () => {
      const strength = await callOrvalValidated(
        (fetchFn) => listStrengthActivitiesApiV1StrengthWorkoutsGet(
          {
            from_date: from,
            to_date: to,
          },
          {},
          fetchFn,
        ),
        z.array(Generated.StrengthActivityResponse),
      );
      return Promise.all(
        strength.map(async (activity) => {
          const exercises = activity.has_training_content
            ? await callOrvalValidated(
                (fetchFn) => listWorkoutExercisesApiV1StrengthWorkoutsActivityIdExercisesGet(
                  activity.activity_id,
                  {},
                  fetchFn,
                ),
                z.array(Generated.WorkoutExerciseResponse),
              )
            : [];
          return { activity, exercises: exercises as WorkoutExercise[] };
        }),
      );
    },
  );
  const loading = !resolved || isLoading;
  const error = swrError ? apiErrorMessage(swrError, "获取数据失败") : null;

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
        <>
          <p className="text-caption1 text-text-muted">力量活动记录（包含有训练内容与仅有活动记录）</p>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            {workouts.map((w) => (
              <StrengthCard key={w.activity.activity_id} data={w} timezone={timezone} returnTo={returnTo} />
            ))}
          </div>
        </>
      )}

      <div className="flex items-center justify-between border-t border-border-subtle pt-4">
        <button
          type="button"
          onClick={() => window.scrollTo({ top: 0, behavior: "smooth" })}
          className="focus-ring inline-flex min-h-[44px] items-center rounded-md bg-accent px-4 text-subheadline font-semibold text-on-accent transition-opacity hover:opacity-90"
        >
          回到顶部新增训练
        </button>
      </div>
    </div>
  );
}
