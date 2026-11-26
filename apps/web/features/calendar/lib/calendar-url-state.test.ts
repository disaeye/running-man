import { describe, expect, it } from "vitest";
import {
  buildCalendarUrl,
  parseCalendarDateParam,
  parseSportFamilyParam,
} from "@features/calendar/lib/calendar-url-state";

describe("parseCalendarDateParam", () => {
  it("接受合法的 YYYY-MM-DD", () => {
    expect(parseCalendarDateParam("2026-11-04")).toBe("2026-11-04");
  });

  it("空值、格式错误与不存在的日期都返回 null", () => {
    expect(parseCalendarDateParam(null)).toBeNull();
    expect(parseCalendarDateParam("")).toBeNull();
    expect(parseCalendarDateParam("2026-11-4")).toBeNull();
    expect(parseCalendarDateParam("2026-13-01")).toBeNull();
    expect(parseCalendarDateParam("2026-02-30")).toBeNull();
    expect(parseCalendarDateParam("20261104")).toBeNull();
  });
});

describe("parseSportFamilyParam", () => {
  it("识别跑步和力量筛选，其余显示全部", () => {
    expect(parseSportFamilyParam("strength")).toBe("strength");
    expect(parseSportFamilyParam("run")).toBe("running");
    expect(parseSportFamilyParam("running")).toBe("running");
    expect(parseSportFamilyParam("cycling")).toBe("all");
    expect(parseSportFamilyParam("swim")).toBe("all");
    expect(parseSportFamilyParam(null)).toBe("all");
  });
});

describe("buildCalendarUrl", () => {
  it("周历是默认视图，不带 view 参数", () => {
    expect(buildCalendarUrl(new URLSearchParams("view=month"), { view: "week" })).toBe("/calendar");
  });

  it("月历写入 view=month，并保留其他参数", () => {
    expect(
      buildCalendarUrl(new URLSearchParams("sport=strength&date=2026-11-04"), { view: "month" }),
    ).toBe("/calendar?sport=strength&date=2026-11-04&view=month");
  });

  it("跑步筛选写入 sport=run", () => {
    expect(buildCalendarUrl(new URLSearchParams(), { family: "running" })).toBe("/calendar?sport=run");
  });

  it("家族回全部时移除 sport 参数", () => {
    expect(buildCalendarUrl(new URLSearchParams("sport=strength"), { family: "all" })).toBe("/calendar");
  });

  it("锚点写为 date，null 清除锚点回到今天；未提及的参数原样保留", () => {
    expect(buildCalendarUrl(new URLSearchParams(), { date: "2026-10-28" })).toBe("/calendar?date=2026-10-28");
    expect(buildCalendarUrl(new URLSearchParams("date=2026-10-28"), { date: null })).toBe("/calendar");
    expect(buildCalendarUrl(new URLSearchParams("date=2026-10-28&view=month"), { date: null })).toBe("/calendar?view=month");
  });
});
