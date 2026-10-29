import { describe, expect, it } from "vitest";
import { buildWeekTrainingRows } from "./week-training-rows";
import type { ActivitySummary } from "@shared/types/activity";
import type { CalendarEventDTO } from "@features/calendar/components/types";

function mockActivity(partial: Partial<ActivitySummary>): ActivitySummary {
  return {
    activity_id: "a1",
    sport: "Run",
    start_time: "2026-10-26T08:00:00Z",
    duration_s: 2400,
    distance_m: 8000,
    elevation_gain_m: 50,
    tss: 45,
    avg_hr: 145,
    max_hr: 165,
    avg_power: null,
    np: null,
    intensity_factor: null,
    icu_ctl: null,
    avg_cadence: 176,
    avg_speed: 3.33,
    calories: 500,
    external_id: null,
    source: "intervals_icu",
    file_type: "fit",
    device_name: null,
    has_gps: true,
    summary_polyline: null,
    ...partial,
  };
}

function mockEvent(partial: Partial<CalendarEventDTO>): CalendarEventDTO {
  return {
    event_id: "e1",
    category: "workout",
    start_time: "2026-10-27T08:00:00Z",
    sport_type: "Run",
    training_type: "easy",
    predicted_tss: 62,
    done: false,
    workout_prescription: null,
    ...partial,
  };
}

describe("buildWeekTrainingRows", () => {
  const weekStart = new Date("2026-10-26T00:00:00");
  const todayKey = "2026-10-27"; // 周二

  it("produces rows for completed activities and planned events, omitting empty days", () => {
    const activityMap = new Map<string, ActivitySummary[]>([
      ["2026-10-26", [mockActivity({ tss: 28, duration_s: 2400 })]],
    ]);
    const events: CalendarEventDTO[] = [
      mockEvent({
        start_time: "2026-10-27T08:00:00Z",
        name: "有氧耐力 60 分钟",
        predicted_tss: 62,
      }),
      mockEvent({
        start_time: "2026-10-29T08:00:00Z",
        name: "阈值间歇 5×1km",
        predicted_tss: 78,
      }),
    ];

    const rows = buildWeekTrainingRows({
      events,
      activityMap,
      weekStart,
      timezone: "UTC",
      todayKey,
    });

    expect(rows).toHaveLength(3);
    expect(rows[0]).toEqual({
      dayKey: "2026-10-26",
      dayLabel: "周一",
      title: "跑步 40 分钟",
      metric: "28 TSS",
      isToday: false,
      isDone: true,
    });
    expect(rows[1]).toEqual({
      dayKey: "2026-10-27",
      dayLabel: "周二",
      title: "有氧耐力 60 分钟",
      metric: "今天 · 62",
      isToday: true,
      isDone: false,
    });
    expect(rows[2]).toEqual({
      dayKey: "2026-10-29",
      dayLabel: "周四",
      title: "阈值间歇 5×1km",
      metric: "78 TSS",
      isToday: false,
      isDone: false,
    });
  });

  it("always includes today even on a rest day", () => {
    const activityMap = new Map<string, ActivitySummary[]>();
    const events: CalendarEventDTO[] = [];

    const rows = buildWeekTrainingRows({
      events,
      activityMap,
      weekStart,
      timezone: "UTC",
      todayKey,
    });

    expect(rows).toHaveLength(1);
    expect(rows[0]).toEqual({
      dayKey: "2026-10-27",
      dayLabel: "周二",
      title: "休息",
      metric: "今天",
      isToday: true,
      isDone: false,
    });
  });
});
