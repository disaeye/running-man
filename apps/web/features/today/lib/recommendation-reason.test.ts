import { describe, expect, it } from "vitest";
import { recommendationReason } from "./recommendation-reason";
import type { CoachRecommendation } from "@features/today/hooks/useCoachContext";

const decision = { reason: "按计划执行，配速 4'26\"–4'39\" /km，预计 TSS 30。" } as CoachRecommendation;

describe("recommendationReason", () => {
  it("存在课表区间时，建议文案引用同一课表配速", () => {
    expect(recommendationReason(decision, true)).toBe("按计划执行，配速 课表配速，预计 TSS 30。");
  });

  it("没有课表字段时保留原始建议", () => {
    expect(recommendationReason(decision, false)).toBe(decision.reason);
  });
});
