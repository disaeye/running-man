import { describe, expect, it } from "vitest";
import {
  buildWorkoutPrescriptionPayload,
  defaultSportForFamily,
  formatPaceInput,
  parsePaceInput,
  segmentsFromEvent,
} from "./workout-prescription";

describe("parsePaceInput & formatPaceInput", () => {
  it("解析 m:ss 与 m'ss 格式并支持双向还原", () => {
    expect(parsePaceInput("")).toEqual({ ok: true, value: null });
    expect(parsePaceInput("4:30")).toEqual({ ok: true, value: 270 });
    expect(parsePaceInput("4'45")).toEqual({ ok: true, value: 285 });
    expect(formatPaceInput(270)).toBe("4:30");
  });

  it("拒绝非法秒数与越界配速", () => {
    expect(parsePaceInput("4:75").ok).toBe(false);
    expect(parsePaceInput("1:10").ok).toBe(false);
    expect(parsePaceInput("abc").ok).toBe(false);
  });
});

describe("buildWorkoutPrescriptionPayload", () => {
  it("支持重复组数与恢复段，计算总时长与预计距离并输出结构化处方", () => {
    const result = buildWorkoutPrescriptionPayload({
      date: "2026-11-12",
      name: "乳酸阈值间歇",
      goal: "threshold",
      sportType: "Run",
      segments: [
        { id: "1", segment_type: "Warmup", duration_s: 600 },
        {
          id: "2",
          segment_type: "IntervalsT",
          duration_s: 240,
          repetitions: 5,
          recovery_s: 90,
          pace_min_s_km: 260,
          pace_max_s_km: 270,
        },
        { id: "3", segment_type: "Cooldown", duration_s: 600 },
      ],
    });

    expect(result.trainingType).toBe("threshold");
    // 10m + 5*4m + 4*1.5m + 10m = 46 min
    expect(result.prescription.duration_min).toBe(46);
    expect(result.prescription.pace_min_s_km).toBe(260);
    expect(result.prescription.pace_max_s_km).toBe(270);
    // 1200s / 265 s/km * 1000 ≈ 4528m
    expect(result.predictedDistanceM).toBe(4528);
    expect(result.prescription.segments[1]?.repetitions).toBe(5);
    expect(result.prescription.segments[1]?.recovery_min).toBe(1.5);
  });

  it("力量训练不硬编码配速也不编造距离", () => {
    const result = buildWorkoutPrescriptionPayload({
      date: "2026-11-12",
      name: "下肢力量",
      goal: "aerobic-base",
      sportType: defaultSportForFamily("strength"),
      segments: [
        { id: "1", segment_type: "SteadyState", duration_s: 2700, pace_min_s_km: 300 },
      ],
    });

    expect(result.sportType).toBe("Workout");
    expect(result.predictedDistanceM).toBeNull();
    expect(result.prescription.pace_min_s_km).toBeNull();
  });

  it("从已有事件的结构化处方回填编排器段落", () => {
    const segs = segmentsFromEvent({
      event_id: "e1",
      start_time: "2026-11-12T00:00:00Z",
      category: "workout",
      workout_prescription: {
        type: "intervals",
        duration_min: 30,
        segments: [
          {
            type: "intervals",
            duration_min: 20,
            repetitions: 4,
            recovery_min: 2,
            pace_min_s_km: 250,
            pace_max_s_km: 260,
          },
        ],
      },
    });

    expect(segs).toHaveLength(1);
    expect(segs[0]?.segment_type).toBe("IntervalsT");
    expect(segs[0]?.repetitions).toBe(4);
    expect(segs[0]?.duration_s).toBe(300);
    expect(segs[0]?.recovery_s).toBe(120);
  });
});
