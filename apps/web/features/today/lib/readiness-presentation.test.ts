import { describe, expect, it } from "vitest";
import {
  assessReadiness,
  decisionReason,
  decisionTitle,
  isStaleData,
  type Assessment,
} from "@features/today/lib/readiness-presentation";

/**
 * These rules exist because the Today page used to fabricate an answer.
 *
 * It showed a readiness of 82 with the level "high", the workout "45min 基础
 * 有氧慢跑", and a pulsing LIVE badge whenever the coach-context request
 * failed — and, separately, treated the API's neutral 50 as a real measurement
 * when the athlete simply had no wellness data. Both cases presented invented
 * information as an assessment. The tests below pin the honest behaviour.
 */

const NO_DATA = [
  { name: "sleep", detail: "睡眠数据不足" },
  { name: "resting_hr", detail: "静息心率数据不足" },
  { name: "hrv", detail: "HRV 数据不足" },
];

describe("assessReadiness", () => {
  it("marks an all-missing factor list as not assessed, despite a score of 50", () => {
    const result = assessReadiness({ score: 50, level: "recovery", factors: NO_DATA });

    expect(result.available).toBe(false);
    expect(result.windowLabel).toBe("AWAITING DATA");
  });

  it("treats a payload with no factors as not assessed", () => {
    // Nothing to show that anything was measured.
    expect(assessReadiness({ score: 50, level: "recovery", factors: [] }).available).toBe(
      false,
    );
  });

  it("treats a missing payload as not assessed", () => {
    expect(assessReadiness(null).available).toBe(false);
  });

  it("trusts the server's data_sufficient field over the factor text", () => {
    // The field is the contract. A response whose details happen to read
    // "数据不足" but which the server marked sufficient must be shown as
    // assessed — the opposite of the text-matching fallback.
    const result = assessReadiness({
      score: 72,
      level: "moderate",
      factors: NO_DATA,
      data_sufficient: true,
    });

    expect(result.available).toBe(true);
    expect(result.score).toBe(72);
  });

  it("treats data_sufficient=false as not assessed even with a non-50 score", () => {
    const result = assessReadiness({
      score: 63,
      level: "moderate",
      factors: [],
      data_sufficient: false,
    });

    expect(result.available).toBe(false);
    expect(result.windowLabel).toBe("AWAITING DATA");
  });

  it("counts a score as real as soon as one factor was measured", () => {
    const result = assessReadiness({
      score: 67,
      level: "moderate",
      factors: [{ name: "sleep", detail: "睡眠 7.2h，7日均值 7.0h" }, ...NO_DATA],
    });

    expect(result.available).toBe(true);
    expect(result.score).toBe(67);
    expect(result.levelLabel).toBe("状态稳定");
  });

  it("lists what is missing, in athlete-facing language, for the empty state", () => {
    const result = assessReadiness({ score: 50, level: "recovery", factors: NO_DATA });

    expect(result.missing).toEqual(["睡眠", "静息心率", "HRV"]);
  });

  it("does not report missing inputs when everything was measured", () => {
    const result = assessReadiness({
      score: 82,
      level: "high",
      factors: [{ name: "sleep", detail: "睡眠 8.0h" }],
    });

    expect(result.missing).toEqual([]);
    expect(result.windowLabel).toBe("GREEN WINDOW");
  });

  it("uses a non-high level label when readiness is not high", () => {
    const result = assessReadiness({
      score: 45,
      level: "recovery",
      factors: [{ name: "sleep", detail: "睡眠 4.0h" }],
    });

    expect(result.levelLabel).toBe("需要恢复");
    expect(result.windowLabel).toBe("ADAPTIVE WINDOW");
  });

  it("passes through an unknown level rather than guessing", () => {
    const result = assessReadiness({
      score: 60,
      level: "brand_new_level",
      factors: [{ name: "sleep", detail: "有数据" }],
    });

    expect(result.levelLabel).toBe("brand_new_level");
  });
});

describe("isStaleData", () => {
  it("treats stale and missing feeds as stale", () => {
    expect(isStaleData("stale")).toBe(true);
    expect(isStaleData("missing")).toBe(true);
  });

  it("treats a fresh or unknown feed as not stale", () => {
    expect(isStaleData("fresh")).toBe(false);
    expect(isStaleData(null)).toBe(false);
    expect(isStaleData(undefined)).toBe(false);
  });
});

const NOT_ASSESSED: Assessment = {
  available: false,
  score: 0,
  levelLabel: "",
  windowLabel: "AWAITING DATA",
  missing: ["睡眠", "静息心率"],
};

const ASSESSED: Assessment = {
  available: true,
  score: 67,
  levelLabel: "状态稳定",
  windowLabel: "ADAPTIVE WINDOW",
  missing: [],
};

describe("decisionTitle", () => {
  it("prefers a planned workout name", () => {
    expect(
      decisionTitle({ reason: null, next_workout: { name: "节奏跑 5×1km" } }, ASSESSED),
    ).toBe("节奏跑 5×1km");
  });

  it("says there is no data instead of inventing a session", () => {
    // Previously this was the hard-coded "45min 基础有氧慢跑".
    expect(decisionTitle(null, NOT_ASSESSED)).toBe("还没有可分析的训练数据");
  });

  it("reports no scheduled session when data exists but nothing is planned", () => {
    expect(decisionTitle({ reason: null, next_workout: null }, ASSESSED)).toBe(
      "今天暂无具体课表",
    );
  });
});

describe("decisionReason", () => {
  it("uses the API's reason when present", () => {
    expect(
      decisionReason(
        { reason: "readiness 50，无计划训练，周TSS 6", next_workout: null },
        NOT_ASSESSED,
      ),
    ).toBe("readiness 50，无计划训练，周TSS 6");
  });

  it("names the missing inputs when nothing could be assessed", () => {
    const reason = decisionReason(null, NOT_ASSESSED);

    expect(reason).toContain("睡眠");
    expect(reason).toContain("静息心率");
    // Points at an action rather than leaving the athlete stuck.
    expect(reason).toContain("连接数据源");
  });

  it("stays generic when no factor names are known", () => {
    const reason = decisionReason(null, { ...NOT_ASSESSED, missing: [] });

    expect(reason).toContain("恢复数据");
  });

  it("does not claim a missing dataset when data was assessed", () => {
    const reason = decisionReason(null, ASSESSED);

    expect(reason).toBe("当前没有为今天安排训练。");
    expect(reason).not.toContain("缺少");
  });
});
