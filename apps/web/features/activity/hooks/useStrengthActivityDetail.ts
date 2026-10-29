"use client";

import useSWR from "swr";
import { callOrvalValidated } from "@shared/api/orval-adapter";
import {
  listSetsApiV1StrengthWorkoutExercisesWorkoutExerciseIdSetsGet,
  listWorkoutExercisesApiV1StrengthWorkoutsActivityIdExercisesGet,
} from "@shared/api/generated/clients";
import * as Generated from "@shared/api/generated/model";
import { assembleStrengthActivityDetail, type StrengthActivityExercise } from "@features/activity/hooks/strength-activity-detail";
import { z } from "zod";

export type { StrengthActivityExercise } from "@features/activity/hooks/strength-activity-detail";

export interface StrengthActivityDetail {
  readonly exercises: readonly StrengthActivityExercise[];
  readonly loading: boolean;
  readonly error: string | null;
}

export function useStrengthActivityDetail(activityId: string): StrengthActivityDetail {
  const { data, error, isLoading } = useSWR(
    ["/strength/activity-detail", activityId],
    () => fetchStrengthActivityDetail(activityId),
  );
  return {
    exercises: data ?? [],
    loading: isLoading,
    error: error?.message ?? null,
  };
}

async function fetchStrengthActivityDetail(activityId: string): Promise<StrengthActivityExercise[]> {
  const exercises = await callOrvalValidated(
    (fetchFn) => listWorkoutExercisesApiV1StrengthWorkoutsActivityIdExercisesGet(activityId, {}, fetchFn),
    z.array(Generated.WorkoutExerciseResponse),
  );
  const setRows = await Promise.all(
    exercises.map((exercise) => callOrvalValidated(
      (fetchFn) => listSetsApiV1StrengthWorkoutExercisesWorkoutExerciseIdSetsGet(exercise.id, {}, fetchFn),
      z.array(Generated.SetResponse),
    )),
  );
  return assembleStrengthActivityDetail(exercises, setRows);
}
