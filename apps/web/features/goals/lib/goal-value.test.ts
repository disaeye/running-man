import { describe, expect, it } from "vitest";
import type { Goal, GoalType } from "@shared/types/goals";
import { goalReading } from "@features/goals/lib/goal-value";

/**
 * 目标卡片要读的是「1:30:40」「412 公里」「72.5 kg」这样的形态，而不是
 * 数据库里存的裸数字。这里钉住每种类型的读法、单位换算，以及没有值时
 * 必须是 null——null 让调用方画占位符，而不是显示一个 0。
 */

function makeGoal(type: GoalType, unit: string | null): Goal {
  return {
    goal_id: "g1",
    athlete_id: "a1",
    type,
    title: "测试目标",
    target_value: null,
    current_value: 0,
    unit,
    start_date: null,
    sport_key: null,
    is_primary: false,
    baseline_value: null,
    direction: type === "weight" ? "decrease" : "increase",
    target_date: null,
    race_distance_m: null,
    race_target_time_s: null,
    race_actual_time_s: null,
    race_activity_id: null,
    status: "active",
    created_at: "2026-01-01T00:00:00Z",
    updated_at: "2026-01-01T00:00:00Z",
  };
}

describe("goalReading", () => {
  it("reads a race goal in seconds as a clock", () => {
    expect(goalReading(makeGoal("event", "秒"), 5440)).toEqual({
      value: "1:30:40",
    });
  });

  it("converts a race goal in minutes into a clock", () => {
    expect(goalReading(makeGoal("event", "分"), 45)).toEqual({ value: "45:00" });
  });

  it("treats an empty unit as seconds", () => {
    expect(goalReading(makeGoal("event", null), 5440)).toEqual({
      value: "1:30:40",
    });
    expect(goalReading(makeGoal("event", ""), 5440)).toEqual({
      value: "1:30:40",
    });
  });

  it("reads a time goal in minutes as a clock", () => {
    expect(goalReading(makeGoal("time", "min"), 45)).toEqual({ value: "45:00" });
  });

  it("reads a distance goal in whole kilometres", () => {
    expect(goalReading(makeGoal("distance", "km"), 412)).toEqual({
      value: "412",
      unit: "公里",
    });
  });

  it("keeps one decimal for a fractional distance", () => {
    expect(goalReading(makeGoal("distance", "km"), 412.5)).toEqual({
      value: "412.5",
      unit: "公里",
    });
  });

  it("reads a distance goal in metres as metres", () => {
    expect(goalReading(makeGoal("distance", "m"), 5000)).toEqual({
      value: "5000",
      unit: "米",
    });
  });

  it("reads a weight goal with its own unit", () => {
    expect(goalReading(makeGoal("weight", "kg"), 72.5)).toEqual({
      value: "72.5",
      unit: "kg",
    });
  });

  it("drops the decimal on a whole weight", () => {
    expect(goalReading(makeGoal("weight", "kg"), 72)).toEqual({
      value: "72",
      unit: "kg",
    });
  });

  it("reads a consistency goal in days", () => {
    expect(goalReading(makeGoal("consistency", "天"), 25)).toEqual({
      value: "25",
      unit: "天",
    });
  });

  it("returns null when there is no value", () => {
    expect(goalReading(makeGoal("distance", "km"), null)).toBeNull();
    expect(goalReading(makeGoal("event", "秒"), null)).toBeNull();
  });
});
