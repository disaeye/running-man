import { describe, expect, it } from "vitest";
import type { WellnessPoint } from "@features/health/hooks/useWellness";
import { deriveCurrentReadings, latestDatedValue } from "./physiology-display";

function point(day: string, values: Partial<WellnessPoint> = {}): WellnessPoint {
  return {
    day,
    resting_hr: null,
    hrv: null,
    hrv_sdnn: null,
    weight: null,
    body_fat_pct: null,
    sleep_secs: null,
    sleep_score: null,
    sleep_quality: null,
    avg_sleeping_hr: null,
    steps: null,
    vo2max: null,
    spo2: null,
    respiration_rate: null,
    systolic_bp: null,
    diastolic_bp: null,
    kcal_consumed: null,
    carbs_g: null,
    protein_g: null,
    fat_g: null,
    hydration: null,
    menstrual_phase: null,
    menstrual_phase_predicted: null,
    fatigue: null,
    soreness: null,
    stress: null,
    mood: null,
    motivation: null,
    injury_status: null,
    source_readiness: null,
    ...values,
  };
}

describe("deriveCurrentReadings", () => {
  it("每个指标独立取最近一条非空记录", () => {
    const readings = deriveCurrentReadings([
      point("2025-06-28", { vo2max: 57, resting_hr: 48, weight: 69.2 }),
      point("2026-10-31", { weight: 68.9, body_fat_pct: 19.6 }),
      point("2026-11-03", { resting_hr: 47 }),
      point("2026-11-04", { hrv: 68.3 }),
    ]);
    expect(readings).toEqual({
      vo2max: { day: "2025-06-28", value: 57 },
      restingHr: { day: "2026-11-03", value: 47 },
      weight: { day: "2026-10-31", value: 68.9 },
      bodyFatPct: { day: "2026-10-31", value: 19.6 },
    });
  });

  it("最新一行缺列不会让较早的记录消失", () => {
    const readings = deriveCurrentReadings([
      point("2026-06-28", { vo2max: 59 }),
      point("2026-11-04", { steps: 9000 }),
    ]);
    expect(readings.vo2max).toEqual({ day: "2026-06-28", value: 59 });
    expect(readings.restingHr).toBeNull();
  });

  it("没有记录时返回 null，不用零值填充", () => {
    expect(deriveCurrentReadings([])).toEqual({
      vo2max: null,
      restingHr: null,
      weight: null,
      bodyFatPct: null,
    });
  });
});

describe("latestDatedValue", () => {
  it("忽略 null 与字符串，只认数值", () => {
    const rows = [point("2026-01-01", { vo2max: 55 }), point("2026-01-02")];
    expect(latestDatedValue(rows, "vo2max")).toEqual({ day: "2026-01-01", value: 55 });
  });
});
