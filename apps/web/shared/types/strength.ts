/** Types mirroring the Python API strength schemas. */

export interface WorkoutSet {
  id: number;
  workout_exercise_id: number;
  set_number: number;
  weight_kg: number | null;
  reps: number;
  rpe: number | null;
  set_type: string;
  rest_seconds: number | null;
  completed: boolean;
  estimated_1rm_kg: number | null;
}

export interface Exercise {
  id: number;
  name_cn: string;
  name_en: string;
  category: string;
  primary_muscles: string[];
  secondary_muscles: string[];
  equipment: string;
  movement_pattern: string;
  instructions: string;
  common_mistakes: string;
  difficulty: string;
}

/** Flat response from GET /api/strength/workouts/{id}/exercises */
export interface WorkoutExercise {
  id: number;
  activity_id: string;
  athlete_id: string;
  exercise_id: number;
  order_index: number;
  notes: string | null;
  created_at: string;
  sets: WorkoutSet[];
  name_cn: string | null;
  name_en: string | null;
  category: string | null;
  primary_muscles: string[] | null;
  secondary_muscles: string[] | null;
  equipment: string | null;
  movement_pattern: string | null;
}

/** Payload to create a new set. */
export interface SetCreatePayload {
  set_number: number;
  weight_kg?: number | null;
  reps: number;
  rpe?: number | null;
  set_type?: string;
  rest_seconds?: number | null;
  completed?: boolean;
}

/** Payload to update a set. */
export interface SetUpdatePayload {
  set_number?: number;
  weight_kg?: number | null;
  reps?: number;
  rpe?: number | null;
  set_type?: string;
  rest_seconds?: number | null;
  completed?: boolean;
  estimated_1rm_kg?: number | null;
}

/** Payload to create a workout exercise. */
export interface WorkoutExerciseCreatePayload {
  exercise_id: number;
  order_index: number;
  notes?: string | null;
}

/** Payload to update a workout exercise. */
export interface WorkoutExerciseUpdatePayload {
  order_index?: number;
  notes?: string | null;
}

/** Analytics: muscle volume breakdown. */
export interface MuscleVolumeItem {
  muscle: string;
  volume_kg: number;
  exercise_count: number;
  set_count: number;
}

/** Analytics: estimated 1RM progression. */
export interface E1rmItem {
  date: string;
  exercise_id: number;
  exercise_name: string;
  estimated_1rm_kg: number;
}

/** Analytics: volume distribution by category. */
export interface DistributionItem {
  category: string;
  percentage: number;
  volume_kg: number;
}
