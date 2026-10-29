import { describe, expect, it } from "vitest";
import { getAnalysisActivityKind } from "@features/analysis/lib/activity-type";
import { getSportConfig } from "@shared/config/sport-config";

describe("analysis activity kind", () => {
  it("groups the contracted run sports under the running report", () => {
    expect(getAnalysisActivityKind("Run")).toBe("running");
    expect(getAnalysisActivityKind("VirtualRun")).toBe("running");
    expect(getAnalysisActivityKind("TrailRun")).toBe("running");
  });

  it("groups strength sport keys under the dedicated strength report", () => {
    expect(getAnalysisActivityKind("Workout")).toBe("strength");
    expect(getAnalysisActivityKind("WeightTraining")).toBe("strength");
    expect(getSportConfig("Workout").label).toBe("健身");
    expect(getSportConfig("WeightTraining").label).toBe("力量训练");
  });

  it("leaves other sport families out of the running and strength reports", () => {
    expect(getAnalysisActivityKind("Ride")).toBe("other");
    expect(getAnalysisActivityKind("Swim")).toBe("other");
    expect(getAnalysisActivityKind(null)).toBe("other");
  });
});
