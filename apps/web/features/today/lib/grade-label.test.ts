import { describe, expect, it } from "vitest";
import {
  eventLabel,
  gradeSnapshot,
  tierLabel,
  type AthleteGradePayload,
} from "@features/today/lib/grade-label";

/**
 * 身份条要的是「精英级 / 半程马拉松 · 35-39 岁组 · 1:32:05」这样的句子。
 * 接口给的是合同键（`tier1`、`half`、`age_group: 35`），这里钉住翻译与拼句，
 * 以及「没有等级」必须是 null 而不是一条空字符串——null 才会走累积量形态。
 */

const GRADE: AthleteGradePayload = {
  configured: true,
  grade: {
    tier: "tier1",
    event: "half",
    age_group: 35,
    time_s: 5525,
    race_date: "2026-03-15",
    event_name: "春季半程",
    a1_certified: false,
  },
  age_graded_pct: 62.4,
  reason: null,
};

describe("tierLabel", () => {
  it("translates the three tiers", () => {
    expect([tierLabel("elite"), tierLabel("tier1"), tierLabel("tier2")]).toEqual([
      "精英级",
      "一级",
      "二级",
    ]);
  });

  it("passes an unknown tier through unchanged", () => {
    expect(tierLabel("tier3")).toBe("tier3");
  });
});

describe("eventLabel", () => {
  it("translates the four events", () => {
    expect([
      eventLabel("5k"),
      eventLabel("10k"),
      eventLabel("half"),
      eventLabel("marathon"),
    ]).toEqual(["5K", "10K", "半程马拉松", "马拉松"]);
  });

  it("passes an unknown event through unchanged", () => {
    expect(eventLabel("ultra")).toBe("ultra");
  });
});

describe("gradeSnapshot", () => {
  it("builds the badge, the finish time and the age-graded percentage", () => {
    expect(gradeSnapshot(GRADE)).toEqual({
      badge: "一级",
      time: "1:32:05",
      context: "半程马拉松 · 35-39 岁组",
      detail: "半程马拉松 · 35-39 岁组 · 1:32:05",
      pct: "年龄分级 62.4%",
    });
  });

  it("names the youngest age group without a lower bound", () => {
    const youngest: AthleteGradePayload = {
      ...GRADE,
      grade: { ...GRADE.grade!, age_group: 0 },
    };

    expect(gradeSnapshot(youngest)?.context).toBe("半程马拉松 · 34 岁以下组");
  });

  it("writes sub-hour times as m:ss", () => {
    const fiveK: AthleteGradePayload = {
      ...GRADE,
      grade: { ...GRADE.grade!, event: "5k", time_s: 1122 },
    };

    expect(gradeSnapshot(fiveK)?.time).toBe("18:42");
  });

  it("leaves the percentage null when the API has none", () => {
    expect(gradeSnapshot({ ...GRADE, age_graded_pct: null })?.pct).toBeNull();
  });

  it("returns null when there is no grade", () => {
    expect(gradeSnapshot({ ...GRADE, grade: null })).toBeNull();
    expect(gradeSnapshot(null)).toBeNull();
  });
});
