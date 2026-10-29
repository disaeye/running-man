import { describe, expect, it } from "vitest";
import { createElement } from "react";
import { render, screen } from "@testing-library/react";
import { DraftExerciseList, type DraftExercise } from "@features/strength/components/StrengthWorkoutEditorParts";

const draft: DraftExercise = {
  id: "draft-1",
  exercise: {
    id: "4",
    name_cn: "深蹲",
    name_en: "Squat",
    category: "腿",
    primary_muscles: [],
    secondary_muscles: [],
    equipment: "杠铃",
    movement_pattern: "蹲",
    instructions: "",
    common_mistakes: "",
    difficulty: "中级",
  },
  sets: [
    { id: "set-1", weight_kg: "80", reps: "8", rpe: "7", completed: true },
    { id: "set-2", weight_kg: "70", reps: "10", rpe: "6", completed: true },
  ],
};

function renderDraftList(): void {
  render(createElement(DraftExerciseList, {
    drafts: [draft],
    onAddSet: () => {},
    onRemoveExercise: () => {},
    onRemoveSet: () => {},
    onUpdateSet: () => {},
  }));
}

describe("DraftExerciseList", () => {
  it("shows the exercise set count", () => {
    renderDraftList();
    expect(screen.getByText("2 组")).toBeVisible();
  });

  it("shows a controlled completed state for each set checkbox", () => {
    renderDraftList();
    expect(screen.getByRole("checkbox", { name: "第 1 组已完成" })).toBeChecked();
    expect(screen.getByRole("checkbox", { name: "第 2 组已完成" })).toBeChecked();
  });
});
