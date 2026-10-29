import type { WorkoutExerciseResponseOutput } from "@shared/api/generated/model/workoutExerciseResponse.zod";
import type { SetResponseOutput } from "@shared/api/generated/model/setResponse.zod";

export interface StrengthActivitySet {
  readonly id: number;
  readonly workout_exercise_id: number;
  readonly set_number: number;
  readonly weight_kg: number | null;
  readonly reps: number;
  readonly rpe: number | null;
  readonly completed: boolean;
  readonly estimated_1rm_kg: number | null;
}

export interface StrengthActivityExercise {
  readonly id: number;
  readonly activity_id: string;
  readonly athlete_id: string;
  readonly exercise_id: number;
  readonly order_index: number;
  readonly notes: string | null;
  readonly created_at: string;
  readonly name_cn: string | null;
  readonly name_en: string | null;
  readonly category: string | null;
  readonly primary_muscles: string[] | null;
  readonly secondary_muscles: string[] | null;
  readonly equipment: string | null;
  readonly movement_pattern: string | null;
  readonly sets: readonly StrengthActivitySet[];
}

export function assembleStrengthActivityDetail(
  exercises: readonly WorkoutExerciseResponseOutput[],
  setsByExercise: readonly (readonly SetResponseOutput[])[],
): StrengthActivityExercise[] {
  return exercises.map((exercise, index) => {
    const sets = setsByExercise[index];
    if (sets === undefined) {
      throw new Error(`Missing strength sets response for exercise ${exercise.id}`);
    }
    return {
      id: exercise.id,
      activity_id: exercise.activity_id,
      athlete_id: exercise.athlete_id,
      exercise_id: exercise.exercise_id,
      order_index: exercise.order_index,
      notes: exercise.notes ?? null,
      created_at: exercise.created_at,
      name_cn: exercise.name_cn ?? null,
      name_en: exercise.name_en ?? null,
      category: exercise.category ?? null,
      primary_muscles: exercise.primary_muscles ?? null,
      secondary_muscles: exercise.secondary_muscles ?? null,
      equipment: exercise.equipment ?? null,
      movement_pattern: exercise.movement_pattern ?? null,
      sets: sets.map((set) => ({
        id: set.id,
        workout_exercise_id: set.workout_exercise_id,
        set_number: set.set_number,
        weight_kg: set.weight_kg ?? null,
        reps: set.reps,
        rpe: set.rpe ?? null,
        set_type: set.set_type ?? null,
        rest_seconds: set.rest_seconds ?? null,
        completed: set.completed,
        estimated_1rm_kg: set.estimated_1rm_kg ?? null,
      })),
    };
  });
}
