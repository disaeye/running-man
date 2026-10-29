import { describe, expect, it } from "vitest";
import type { WorkoutExerciseResponseOutput } from "@shared/api/generated/model/workoutExerciseResponse.zod";
import type { SetResponseOutput } from "@shared/api/generated/model/setResponse.zod";
import { assembleStrengthActivityDetail } from "@features/activity/hooks/strength-activity-detail";

const exercise: WorkoutExerciseResponseOutput = {
  id: 17,
  activity_id: "workout-1",
  athlete_id: "00000000-0000-0000-0000-000000000001",
  exercise_id: 4,
  order_index: 0,
  created_at: "2026-09-20T08:00:00Z",
};

const set: SetResponseOutput = {
  id: 27,
  workout_exercise_id: 17,
  athlete_id: "00000000-0000-0000-0000-000000000001",
  set_number: 1,
  reps: 8,
  completed: true,
  created_at: "2026-09-20T08:00:00Z",
};

describe("assembleStrengthActivityDetail", () => {
  it("joins exercise and set responses and normalizes optional API fields", () => {
    const result = assembleStrengthActivityDetail([exercise], [[set]]);
    expect(result[0]).toMatchObject({
      id: 17,
      name_cn: null,
      notes: null,
      sets: [{ id: 27, weight_kg: null, rpe: null, set_type: null, rest_seconds: null, estimated_1rm_kg: null, completed: true }],
    });
  });

  it("throws when an exercise response has no corresponding sets response", () => {
    expect(() => assembleStrengthActivityDetail([exercise], [])).toThrow(
      "Missing strength sets response for exercise 17",
    );
  });
});
