import type { DraftExercise, DraftSet } from "../components/StrengthWorkoutEditorParts";

let draftSequence = 0;

export const createDraftId = () => `draft-${++draftSequence}`;

export function createEmptySet(defaultWeight = "60"): DraftSet {
  return {
    id: createDraftId(),
    weight_kg: defaultWeight,
    reps: "10",
    rpe: "",
    completed: true,
  };
}

export function formatLocalDate(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

export function computeSessionTotals(drafts: readonly DraftExercise[]): {
  readonly exercises: number;
  readonly sets: number;
  readonly volume: number;
} {
  let sets = 0;
  let volume = 0;
  for (const d of drafts) {
    for (const s of d.sets) {
      if (!s.completed) continue;
      const reps = parseInt(s.reps, 10) || 0;
      const weight = parseFloat(s.weight_kg) || 0;
      if (reps > 0) {
        sets += 1;
        volume += weight * reps;
      }
    }
  }
  return { exercises: drafts.length, sets, volume: Math.round(volume) };
}

export function computeSquatE1rm(drafts: readonly DraftExercise[]): number | null {
  const squatDraft = drafts.find((d) => d.exercise.name_cn.includes("深蹲"));
  if (!squatDraft) return null;
  let peak = 0;
  for (const s of squatDraft.sets) {
    if (!s.completed) continue;
    const weight = parseFloat(s.weight_kg);
    const reps = parseInt(s.reps, 10);
    if (weight > 0 && reps >= 1 && reps <= 10) {
      const est = reps === 1 ? weight : weight * (1 + reps / 30);
      if (est > peak) peak = est;
    }
  }
  return peak > 0 ? peak : null;
}
