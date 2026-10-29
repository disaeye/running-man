import { describe, expect, it } from "vitest";
import { getAnalysisActivityKind } from "@features/analysis/lib/activity-type";
import { getSportConfig } from "@shared/config/sport-config";

describe("analysis activity sport classification", () => {
  it("recognizes the registry's distinct strength sport labels", () => {
    expect(getAnalysisActivityKind("Workout")).toBe("strength");
    expect(getAnalysisActivityKind("WeightTraining")).toBe("strength");
    expect(getSportConfig("Workout").label).toBe("健身");
    expect(getSportConfig("WeightTraining").label).toBe("力量训练");
  });

  it("keeps run variants on the run report path", () => {
    expect(getAnalysisActivityKind("Run")).toBe("running");
    expect(getAnalysisActivityKind("VirtualRun")).toBe("running");
    expect(getAnalysisActivityKind("TrailRun")).toBe("running");
  });

  it("returns other for sports outside these two analyses", () => {
    expect(getAnalysisActivityKind("Ride")).toBe("other");
    expect(getAnalysisActivityKind("Swim")).toBe("other");
    expect(getAnalysisActivityKind(null)).toBe("other");
  });
});
