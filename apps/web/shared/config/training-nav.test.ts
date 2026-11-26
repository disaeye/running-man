import { describe, expect, it } from "vitest";
import {
  activityDetailUrl,
  activeTrainingTabFromPath,
  trainingReturnUrl,
  resolveStrengthTab,
  strengthLogUrl,
  strengthTabUrl,
  TRAINING_TABS,
} from "@shared/config/training-nav";

describe("activeTrainingTabFromPath", () => {
  it("三个工作区路径各归其 Tab，详情页同样归记录", () => {
    expect(activeTrainingTabFromPath("/calendar")).toBe("calendar");
    expect(activeTrainingTabFromPath("/activities")).toBe("activities");
    expect(activeTrainingTabFromPath("/activities/act-1")).toBe("activities");
    expect(activeTrainingTabFromPath("/strength")).toBe("strength");
  });

  it("工作区以外的路径不高亮任何 Tab", () => {
    expect(activeTrainingTabFromPath("/goals")).toBeNull();
    expect(activeTrainingTabFromPath("/calendarx")).toBeNull();
  });

  it("三个入口的 href 与各自的 Tab 路径一致", () => {
    expect(TRAINING_TABS.map((tab) => tab.href)).toEqual(["/calendar", "/activities", "/strength"]);
  });
});

describe("resolveStrengthTab", () => {
  it("只有 analytics 是显式值，其余都是记录训练", () => {
    expect(resolveStrengthTab("analytics")).toBe("analytics");
    expect(resolveStrengthTab("log")).toBe("log");
    expect(resolveStrengthTab(null)).toBe("log");
    expect(resolveStrengthTab("garbage")).toBe("log");
  });
});

describe("trainingReturnUrl", () => {
  it("保留三个入口自己的查询参数", () => {
    for (const source of ["/activities?view=list&q=晨跑", "/calendar?view=month&date=2026-11-04", "/strength?tab=analytics"]) {
      const detail = new URL(activityDetailUrl("a1", source), "https://example.com");
      expect(trainingReturnUrl(detail.searchParams.get("returnTo"))).toBe(source);
    }
  });

  it("仅接受三个工作区入口", () => {
    expect(trainingReturnUrl("/activities")).toBe("/activities");
    for (const source of ["//other.example", "https://other.example/calendar", "/activities/a1", "/calendar-other"]) {
      expect(trainingReturnUrl(source)).toBeNull();
    }
  });
});

describe("strengthLogUrl", () => {
  it("记录入口明确选择 log，可同时带上日期", () => {
    expect(strengthLogUrl()).toBe("/strength?tab=log");
    expect(strengthLogUrl("2026-11-04")).toBe("/strength?tab=log&date=2026-11-04");
  });

  it("分析页签与日期可以同时指定", () => {
    expect(strengthTabUrl("analytics", "2026-11-04")).toBe("/strength?tab=analytics&date=2026-11-04");
    expect(strengthTabUrl("analytics")).toBe("/strength?tab=analytics");
  });
});
