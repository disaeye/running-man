import { apiFetch } from "@shared/lib/api";
import * as Generated from "@shared/api/generated/model";
import type { DraftExercise } from "../components/StrengthWorkoutEditorParts";

interface SaveStrengthWorkoutParams {
  date: string;
  name: string;
  notes: string;
  drafts: readonly DraftExercise[];
}

export async function saveStrengthWorkout({
  date,
  name,
  notes,
  drafts,
}: SaveStrengthWorkoutParams): Promise<string> {
  const workout = await apiFetch<Generated.WorkoutCreateResponse>(
    "/strength/workouts",
    {
      method: "POST",
      body: JSON.stringify({
        date,
        name: name.trim() || undefined,
      }),
    },
  );
  const activityId = workout.activity_id;

  for (let i = 0; i < drafts.length; i++) {
    const draft = drafts[i]!;
    const exRes = await apiFetch<Generated.WorkoutExerciseResponse>(
      `/strength/workouts/${activityId}/exercises`,
      {
        method: "POST",
        body: JSON.stringify({
          exercise_id: draft.exercise.id,
          order_index: i,
          notes: i === 0 && notes.trim() ? notes.trim() : undefined,
        }),
      },
    );

    for (const set of draft.sets) {
      const weight = parseFloat(set.weight_kg);
      const reps = parseInt(set.reps, 10);
      const rpe = set.rpe ? parseFloat(set.rpe) : undefined;
      if (reps > 0) {
        await apiFetch(`/strength/workout-exercises/${exRes.id}/sets`, {
          method: "POST",
          body: JSON.stringify({
            weight_kg: isNaN(weight) ? 0 : weight,
            reps,
            rpe: isNaN(rpe!) ? undefined : rpe,
            set_type: "working",
          }),
        });
      }
    }
  }

  return activityId;
}
