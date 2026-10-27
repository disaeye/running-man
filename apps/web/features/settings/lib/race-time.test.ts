import { describe, expect, it } from "vitest";
import { formatRaceTime, parseRaceTime } from "@features/settings/lib/race-time";

/**
 * 成绩输入框接受两种写法，落库的是秒。这里钉住两种写法的换算、以及
 * 非法格式必须是 null——null 让「保存成绩」按钮禁用，而不是把
 * `1:31:60` 静默成 92 分 0 秒。
 */

describe("parseRaceTime", () => {
  it("reads a time with hours", () => {
    expect(parseRaceTime("1:31:20")).toBe(5480);
  });

  it("reads a time without hours", () => {
    expect(parseRaceTime("91:20")).toBe(5480);
  });

  it("reads a short minute-second time", () => {
    expect(parseRaceTime("0:30")).toBe(30);
    expect(parseRaceTime("1:31")).toBe(91);
  });

  it("ignores surrounding whitespace", () => {
    expect(parseRaceTime("  1:31:20 ")).toBe(5480);
  });

  it("rejects malformed input", () => {
    expect(parseRaceTime("")).toBeNull();
    expect(parseRaceTime("1:31:60")).toBeNull();
    expect(parseRaceTime("1:60:20")).toBeNull();
    expect(parseRaceTime("1h31m")).toBeNull();
    expect(parseRaceTime("abc")).toBeNull();
  });
});

describe("formatRaceTime", () => {
  it("writes hours when the time has them", () => {
    expect(formatRaceTime(5480)).toBe("1:31:20");
  });

  it("writes minute and second only under an hour", () => {
    expect(formatRaceTime(2412)).toBe("40:12");
    expect(formatRaceTime(30)).toBe("0:30");
  });

  it("normalises a minute-only time past the hour", () => {
    // 91 分钟就是 1 小时 31 分，显示回到时:分:秒这一种写法。
    expect(formatRaceTime(parseRaceTime("91:20") ?? -1)).toBe("1:31:20");
  });

  it("round-trips the canonical form", () => {
    for (const input of ["1:31:20", "0:30", "2:04:59", "40:12"]) {
      expect(formatRaceTime(parseRaceTime(input) ?? -1)).toBe(input);
    }
  });
});
