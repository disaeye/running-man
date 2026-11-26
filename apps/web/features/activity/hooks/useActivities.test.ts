import { describe, expect, it } from "vitest";
import { hasUsableRange } from "./useActivities";

/**
 * 回归测试：活动区间尚未解析完成时，调用方会先用空字符串构造区间，
 * 直接请求会得到 422。hook 把不完整的区间视为「暂不请求」，这里断言的就是这条守卫。
 */
describe("hasUsableRange", () => {
  it("rejects the empty range a not-yet-resolved caller builds", () => {
    expect(hasUsableRange("", "")).toBe(false);
  });

  it("rejects a half-specified range", () => {
    // One bound missing is still a 422, not a valid open-ended query.
    expect(hasUsableRange("2026-09-01", "")).toBe(false);
    expect(hasUsableRange("", "2026-09-14")).toBe(false);
  });

  it("accepts a complete range", () => {
    expect(hasUsableRange("2026-06-16", "2026-09-14")).toBe(true);
  });

  it("accepts a single-day range", () => {
    expect(hasUsableRange("2026-09-14", "2026-09-14")).toBe(true);
  });
});
