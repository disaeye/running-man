import { describe, expect, it } from "vitest";
import type { ActivitySummary } from "@shared/types/activity";
import type { CalendarEventDTO } from "@features/calendar/components/types";
import {
  buildWeekModel,
  eventFamily,
  loadScale,
  periodLabel,
  monthLabel,
  listLabel,
} from "./training-week";

const FROM = "2026-11-02";
const TO = "2026-11-08";
const TODAY = "2026-11-04";
const TZ = "UTC";

function activity(
  id: string,
  day: string,
  values: Partial<ActivitySummary> = {},
): ActivitySummary {
  return {
    activity_id: id,
    sport: "Run",
    start_time: `${day}T02:00:00Z`,
    distance_m: null,
    duration_s: null,
    avg_hr: null,
    max_hr: null,
    avg_power: null,
    np: null,
    intensity_factor: null,
    tss: null,
    icu_ctl: null,
    avg_cadence: null,
    avg_speed: null,
    elevation_gain_m: null,
    calories: null,
    external_id: null,
    source: null,
    file_type: null,
    device_name: null,
    name: id,
    ...values,
  };
}

function event(
  id: string,
  day: string,
  values: Partial<CalendarEventDTO> = {},
): CalendarEventDTO {
  return {
    event_id: id,
    start_time: `${day}T02:00:00Z`,
    category: "workout",
    status: "planned",
    name: id,
    ...values,
  };
}

describe("buildWeekModel", () => {
  it("四项指标共享同一范围，计划与实际同口径算出差值", () => {
    const model = buildWeekModel({
      activities: [activity("a1", "2026-11-03", {
        distance_m: 10000, duration_s: 3600, tss: 80,
      })],
      events: [event("e1", "2026-11-03", {
        predicted_distance_m: 8000,
        predicted_tss: 70,
        workout_prescription: {
          type: "run", duration_min: 50, segments: [],
        },
      })],
      timezone: TZ, from: FROM, to: TO, today: TODAY,
    });

    expect(model.comparison.from).toBe(FROM);
    expect(model.comparison.to).toBe(TO);
    expect(model.comparison.hasPlan).toBe(true);
    expect(model.comparison.metrics).toEqual({
      sessions: { planned: 1, actual: 1, delta: 0 },
      distanceKm: { planned: 8, actual: 10, delta: 2 },
      durationMin: { planned: 50, actual: 60, delta: 10 },
      tss: { planned: 70, actual: 80, delta: 10 },
    });
  });

  it("无计划的周保留未编排语义，差值不补零", () => {
    const model = buildWeekModel({
      activities: [], events: [],
      timezone: TZ, from: FROM, to: TO, today: TODAY,
    });
    expect(model.comparison.hasPlan).toBe(false);
    expect(model.comparison.metrics.sessions).toEqual({ planned: 0, actual: 0, delta: 0 });
  });

  it("只渲染有内容或今天的日子，其余折叠成计数", () => {
    const model = buildWeekModel({
      activities: [activity("a1", "2026-11-03")],
      events: [event("e1", "2026-11-06")],
      timezone: TZ, from: FROM, to: TO, today: TODAY,
    });
    expect(model.days.map((day) => day.day)).toEqual([
      "2026-11-03", "2026-11-04", "2026-11-06",
    ]);
    expect(model.hiddenCount).toBe(4);
  });

  it("过去有计划无活动标未完成，未来不评价，无计划无记录写没有安排", () => {
    const model = buildWeekModel({
      activities: [],
      events: [event("e1", "2026-11-03"), event("e2", "2026-11-06")],
      timezone: TZ, from: FROM, to: TO, today: TODAY,
    });
    expect(model.days.find((d) => d.day === "2026-11-03")?.state).toBe("missed");
    expect(model.days.find((d) => d.day === "2026-11-04")?.state).toBe("unplanned");
    expect(model.days.find((d) => d.day === "2026-11-06")?.state).toBe("upcoming");
    expect(model.missingSessions).toEqual(["e1"]);
  });

  it("筛选同时作用于活动与计划，越野跑归入 running", () => {
    const model = buildWeekModel({
      activities: [
        activity("trail", "2026-11-03", { sport: "TrailRun", tss: 30 }),
        activity("strength", "2026-11-03", { sport: "WeightTraining", tss: 50 }),
      ],
      events: [
        event("run", "2026-11-03", { sport_type: "Run", predicted_tss: 40 }),
        event("gym", "2026-11-03", { sport_type: "WeightTraining", predicted_tss: 60 }),
      ],
      timezone: TZ, from: FROM, to: TO, today: TODAY, family: "running",
    });
    expect(model.comparison.metrics.tss).toEqual({ planned: 40, actual: 30, delta: -10 });
    expect(eventFamily(event("x", TODAY, { sport_type: "TrailRun" }))).toBe("running");
  });

  it("计划的 sport_type 走同一注册表，未知值不误判为力量", () => {
    expect(eventFamily(event("x", TODAY, { sport_type: "WeightTraining" }))).toBe("strength");
    expect(eventFamily(event("x", TODAY, { sport_type: "Mystery" }))).toBe("all");
    expect(eventFamily(event("x", TODAY))).toBe("all");
  });

  it("删除的计划不进汇总与日行", () => {
    const model = buildWeekModel({
      activities: [],
      events: [event("deleted", "2026-11-03", { status: "deleted", predicted_tss: 99 })],
      timezone: TZ, from: FROM, to: TO, today: TODAY,
    });
    expect(model.comparison.hasPlan).toBe(false);
    expect(model.comparison.metrics.tss.planned).toBe(0);
    expect(model.days.find((d) => d.day === "2026-11-03")).toBeUndefined();
  });

  it("当天只有不同运动族活动时，未完成跑步计划不标为已完成", () => {
    const model = buildWeekModel({
      activities: [activity("gym-am", TODAY, { sport: "WeightTraining", duration_s: 2400, tss: 30 })],
      events: [
        event("run-pm", TODAY, {
          sport_type: "Run",
          workout_prescription: { type: "threshold", duration_min: 50, segments: [] },
        }),
      ],
      timezone: TZ, from: FROM, to: TO, today: TODAY,
    });
    const todayRow = model.days.find((d) => d.day === TODAY);
    expect(todayRow?.state).toBe("upcoming");
    expect(todayRow?.eventMatches.get("run-pm")?.status).toBe("upcoming");
  });

  it("当天两节计划只完成一节时标记为部分完成，未完成的过去课进入 missingSessions", () => {
    const model = buildWeekModel({
      activities: [
        activity("easy-am", "2026-11-03", { sport: "Run", duration_s: 1800 }),
      ],
      events: [
        event("plan-pm", "2026-11-03", {
          sport_type: "Run",
          name: "晚间阈值跑",
          workout_prescription: { type: "threshold", duration_min: 50, segments: [] },
        }),
        event("plan-am", "2026-11-03", {
          sport_type: "Run",
          name: "晨间轻松跑",
          linked_activity_id: "easy-am",
          workout_prescription: { type: "easy", duration_min: 30, segments: [] },
        }),
      ],
      timezone: TZ, from: FROM, to: TO, today: TODAY,
    });
    const dayRow = model.days.find((d) => d.day === "2026-11-03");
    expect(dayRow?.state).toBe("partial");
    expect(dayRow?.eventMatches.get("plan-am")?.status).toBe("completed");
    expect(dayRow?.eventMatches.get("plan-pm")?.status).toBe("missed");
    expect(model.missingSessions).toEqual(["晚间阈值跑"]);
  });

  it("有活动但全部缺失 TSS 时 actualKnown.tss 为 false，不拿 0 顶替", () => {
    const model = buildWeekModel({
      activities: [activity("a1", "2026-11-03", { duration_s: 1800, tss: null })],
      events: [],
      timezone: TZ, from: FROM, to: TO, today: TODAY,
    });
    expect(model.comparison.actualKnown.tss).toBe(false);
    expect(model.comparison.actualKnown.durationMin).toBe(true);
  });
});

describe("loadScale", () => {
  it("档位由传入的历史分位固定，同一负荷不随当月变化", () => {
    const scale = loadScale([20, 40, 60, 80, 100]);
    expect([0, 10, 50, 70, 90, 120].map(scale)).toEqual([0, 1, 2, 3, 4, 4]);
    expect(loadScale([])(50)).toBe(4);
  });
});

describe("范围标签", () => {
  it("周、月、流水各自给出可读范围", () => {
    expect(periodLabel(FROM, TO)).toBe("11-02 – 11-08");
    expect(monthLabel("2026-11")).toBe("2026 年 11 月");
    expect(listLabel(90)).toBe("最近 90 天");
  });
});
