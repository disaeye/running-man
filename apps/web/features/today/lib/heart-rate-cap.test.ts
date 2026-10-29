import { describe, expect, it } from "vitest";
import { resolveHeartRateCap } from "./heart-rate-cap";

describe("resolveHeartRateCap", () => {
  it("prioritizes explicit prescription max heart rate", () => {
    const result = resolveHeartRateCap({
      prescriptionMaxHr: 155,
      workoutType: "easy",
      hrMax: 190,
      lthr: 168,
    });
    expect(result).toEqual({ cap: 155, note: "处方指定" });
  });

  it("calculates aerobic Z2 ceiling from hrMax for easy run", () => {
    const result = resolveHeartRateCap({
      workoutType: "easy",
      hrMax: 190,
    });
    expect(result).toEqual({ cap: 148, note: "Z2 上沿" });
  });

  it("uses lthr for tempo/threshold workout", () => {
    const result = resolveHeartRateCap({
      workoutType: "tempo",
      lthr: 170,
      hrMax: 190,
    });
    expect(result).toEqual({ cap: 170, note: "乳酸阈值" });
  });

  it("uses hrMax for intervals", () => {
    const result = resolveHeartRateCap({
      workoutType: "intervals",
      hrMax: 190,
    });
    expect(result).toEqual({ cap: 190, note: "最大心率" });
  });

  it("returns null when no threshold or prescription is available", () => {
    const result = resolveHeartRateCap({
      workoutType: "easy",
    });
    expect(result).toEqual({ cap: null, note: null });
  });
});
