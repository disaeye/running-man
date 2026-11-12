import { describe, expect, it } from "vitest";
import { groupTrainingByDay, trainingDayStatus } from "./training-calendar";
import type { ActivitySummary } from "@shared/types/activity";
import type { CalendarEventDTO } from "@features/calendar/components/types";

const activity = (activity_id: string, start_time: string): ActivitySummary => ({
  activity_id,
  sport: "Run",
  start_time,
  name: activity_id,
} as ActivitySummary);

const event = (event_id: string, start_time: string, status = "planned"): CalendarEventDTO => ({
  event_id,
  start_time,
  category: "workout",
  status,
});

describe("groupTrainingByDay", () => {
  it("保留同一天全部活动与计划，并按开始时间排列", () => {
    const grouped = groupTrainingByDay([
      activity("evening", "2026-11-03T10:00:00Z"),
      activity("morning", "2026-11-03T01:00:00Z"),
    ], [
      event("strength", "2026-11-03T11:00:00Z"),
      event("run", "2026-11-03T02:00:00Z"),
    ], "Asia/Shanghai");

    expect(grouped.get("2026-11-03")?.activities.map((item) => item.activity_id)).toEqual(["morning", "evening"]);
    expect(grouped.get("2026-11-03")?.events.map((item) => item.event_id)).toEqual(["run", "strength"]);
    expect(trainingDayStatus(grouped.get("2026-11-03"))).toBe("mixed");
  });

  it("排除已删除计划并识别纯计划与无训练日期", () => {
    const grouped = groupTrainingByDay([], [
      event("deleted", "2026-11-03T02:00:00Z", "deleted"),
      event("planned", "2026-11-04T02:00:00Z"),
    ], "Asia/Shanghai");

    expect(grouped.has("2026-11-03")).toBe(false);
    expect(trainingDayStatus(grouped.get("2026-11-04"))).toBe("planned");
    expect(trainingDayStatus(grouped.get("2026-11-05"))).toBe("empty");
  });
});
