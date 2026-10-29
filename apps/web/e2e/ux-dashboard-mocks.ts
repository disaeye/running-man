import type { Page } from "@playwright/test";
import { activityFixture, STRENGTH_ACTIVITY } from "./ux-activity-fixtures";
import { SetResponse } from "@shared/api/generated/model/setResponse.zod";
import { dashboardFixture } from "./ux-dashboard-fixtures";
import type { WorkoutExercise, WorkoutSet } from "@shared/types/strength";

function requestPath(requestUrl: string): string {
  try {
    return new URL(requestUrl).pathname;
  } catch (error) {
    throw new Error("Playwright returned a malformed request URL", { cause: error });
  }
}

const STRENGTH_EXERCISES: WorkoutExercise[] = [
  {
    id: 1,
    activity_id: "activity-strength",
    athlete_id: "00000000-0000-4000-8000-000000000001",
    exercise_id: 101,
    order_index: 0,
    notes: null,
    created_at: "2026-09-20T08:00:00Z",
    name_cn: "杠铃深蹲",
    name_en: "Barbell Squat",
    category: "腿",
    primary_muscles: ["股四头肌"],
    secondary_muscles: ["臀大肌"],
    equipment: "杠铃",
    movement_pattern: "蹲",
    sets: [],
  },
];

const STRENGTH_SETS: Array<WorkoutSet & { readonly athlete_id: string; readonly created_at: string }> = [
  SetResponse.parse({ id: 11, workout_exercise_id: 1, athlete_id: "00000000-0000-4000-8000-000000000001", set_number: 1, weight_kg: 80, reps: 8, rpe: 7, set_type: "working", rest_seconds: 120, completed: true, estimated_1rm_kg: 101, created_at: "2026-09-20T08:00:00Z" }),
  SetResponse.parse({ id: 12, workout_exercise_id: 1, athlete_id: "00000000-0000-4000-8000-000000000001", set_number: 2, weight_kg: 80, reps: 8, rpe: 8, set_type: "working", rest_seconds: 120, completed: true, estimated_1rm_kg: 101, created_at: "2026-09-20T08:00:00Z" }),
];

export async function mockDashboard(page: Page, options: { readonly includeStrengthActivities?: boolean } = {}): Promise<void> {
  await page.route("**/api/v1/**", (route) => {
    const pathname = requestPath(route.request().url());
    const exerciseSetsMatch = pathname.match(/^\/api\/v1\/strength\/workout-exercises\/(\d+)\/sets$/);
    const setUpdateMatch = pathname.match(/^\/api\/v1\/strength\/workout-exercises\/(\d+)\/sets\/(\d+)$/);
    const exerciseId = pathname.match(/^\/api\/v1\/strength\/workouts\/([^/]+)\/exercises$/)?.[1];
    const activity = activityFixture(pathname);
    let body = dashboardFixture(pathname) ?? activity;
    const activityId = pathname.match(/^\/api\/v1\/activities\/([^/]+)$/)?.[1];
    if (activityId?.startsWith("activity-strength")) body = activity;
    if (pathname === "/api/v1/activities" && options.includeStrengthActivities) body = [STRENGTH_ACTIVITY];
    if (exerciseId === "activity-strength") body = STRENGTH_EXERCISES;
    if (exerciseId === "activity-strength-empty") body = [];
    if (exerciseSetsMatch !== null) {
      body = pathname.includes("activity-strength-empty") ? [] : STRENGTH_SETS.map((set) => ({
        ...set,
        workout_exercise_id: Number(exerciseSetsMatch[1]),
      }));
    }
    if (setUpdateMatch !== null) body = { ...STRENGTH_SETS[0], id: Number(setUpdateMatch[2]), workout_exercise_id: Number(setUpdateMatch[1]) };
    if (route.request().method() === "PUT" && setUpdateMatch !== null) {
      return route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(body) });
    }
    if (body === undefined) throw new Error(`Missing UX fixture for ${pathname}`);
    return route.fulfill({
      status: 200,
      contentType: "application/json",
      headers: { "X-API-Version": "1" },
      body: JSON.stringify(body),
    });
  });
}
