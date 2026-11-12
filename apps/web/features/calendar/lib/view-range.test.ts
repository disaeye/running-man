import { describe, expect, it } from "vitest";
import {
  currentWeekAnchor,
  monthGridRangeOf,
  monthScaleRangeOf,
  shiftMonth,
  trailingRangeOf,
  viewRange,
  weekRangeOf,
  yearRangeOf,
} from "./view-range";

describe("weekRangeOf", () => {
  it("返回包含锚点的完整周", () => {
    expect(weekRangeOf("2026-11-03")).toEqual({ from: "2026-11-02", to: "2026-11-08" });
  });

  it("周日仍归属同一个周", () => {
    expect(weekRangeOf("2026-11-08")).toEqual({ from: "2026-11-02", to: "2026-11-08" });
  });
});

describe("monthGridRangeOf", () => {
  it("覆盖当月及补白的 42 天", () => {
    expect(monthGridRangeOf("2026-11")).toEqual({ from: "2026-10-26", to: "2026-12-06" });
  });
});

describe("viewRange", () => {
  const today = "2026-11-03";

  it("周视图按周偏移量取整周", () => {
    expect(viewRange("week", today, -1, "2026-11", 2026)).toEqual({
      from: "2026-10-26",
      to: "2026-11-01",
    });
  });

  it("月视图按选定月份取月历网格", () => {
    expect(viewRange("month", today, 0, "2025-04", 2026)).toEqual({
      from: "2025-03-31",
      to: "2025-05-11",
    });
  });

  it("流水视图取结束于今天的最近 N 天", () => {
    expect(viewRange("list", today, 0, "2026-11", 90)).toEqual({
      from: "2026-08-06",
      to: "2026-11-03",
    });
  });
});

describe("月份与周锚点工具", () => {
  it("shiftMonth 跨年移动", () => {
    expect(shiftMonth("2026-01", -1)).toBe("2025-12");
    expect(shiftMonth("2025-12", 1)).toBe("2026-01");
  });

  it("currentWeekAnchor 按周偏移", () => {
    expect(currentWeekAnchor("2026-11-03", -2)).toBe("2026-10-20");
  });

  it("yearRangeOf 返回全年", () => {
    expect(yearRangeOf(2024)).toEqual({ from: "2024-01-01", to: "2024-12-31" });
  });

  it("月视图档位窗口固定为最近 56 天", () => {
    expect(monthScaleRangeOf("2026-11-03")).toEqual({ from: "2026-09-09", to: "2026-11-03" });
  });

  it("流水窗口以今天为终点，向前不向后", () => {
    expect(trailingRangeOf("2026-01-01", 90)).toEqual({
      from: "2025-10-04",
      to: "2026-01-01",
    });
  });
});
