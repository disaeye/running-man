import { describe, expect, it } from "vitest";
import {
  monthGridRangeOf,
  monthRangeOf,
  monthScaleRangeOf,
  shiftAnchorMonth,
  shiftAnchorWeek,
  shiftMonth,
  trailingRangeOf,
  viewRange,
  weekRangeOf,
} from "./view-range";

describe("weekRangeOf", () => {
  it("返回包含锚点的完整周", () => {
    expect(weekRangeOf("2026-11-03")).toEqual({ from: "2026-11-02", to: "2026-11-08" });
  });

  it("周日仍归属同一个周", () => {
    expect(weekRangeOf("2026-11-08")).toEqual({ from: "2026-11-02", to: "2026-11-08" });
  });
});

describe("monthRangeOf", () => {
  it("只包含当月日期", () => {
    expect(monthRangeOf("2024-02")).toEqual({ from: "2024-02-01", to: "2024-02-29" });
    expect(monthRangeOf("2026-12")).toEqual({ from: "2026-12-01", to: "2026-12-31" });
  });
});

describe("monthGridRangeOf", () => {
  it("覆盖当月及补白的 42 天", () => {
    expect(monthGridRangeOf("2026-11")).toEqual({ from: "2026-10-26", to: "2026-12-06" });
  });
});

describe("viewRange", () => {
  it("周视图取包含锚点的一周", () => {
    expect(viewRange("week", "2026-10-28")).toEqual({ from: "2026-10-26", to: "2026-11-01" });
  });

  it("月视图取锚点所在的月历网格", () => {
    expect(viewRange("month", "2025-04-15")).toEqual({ from: "2025-03-31", to: "2025-05-11" });
  });
});

describe("月份与锚点工具", () => {
  it("shiftMonth 跨年移动", () => {
    expect(shiftMonth("2026-01", -1)).toBe("2025-12");
    expect(shiftMonth("2025-12", 1)).toBe("2026-01");
  });

  it("shiftAnchorWeek 按周位移锚点", () => {
    expect(shiftAnchorWeek("2026-11-03", -2)).toBe("2026-10-20");
    expect(shiftAnchorWeek("2026-11-03", 1)).toBe("2026-11-10");
  });

  it("shiftAnchorMonth 保持同一天，目标月份没有这一天时取月末", () => {
    expect(shiftAnchorMonth("2026-01-15", 1)).toBe("2026-02-15");
    expect(shiftAnchorMonth("2026-01-31", 1)).toBe("2026-02-28");
    expect(shiftAnchorMonth("2026-03-31", -1)).toBe("2026-02-28");
    expect(shiftAnchorMonth("2025-12-31", 2)).toBe("2026-02-28");
  });

  it("月视图档位窗口固定为最近 56 天", () => {
    expect(monthScaleRangeOf("2026-11-03")).toEqual({ from: "2026-09-09", to: "2026-11-03" });
  });

  it("trailingRangeOf 以给定日期为终点，向前不向后", () => {
    expect(trailingRangeOf("2026-01-01", 90)).toEqual({
      from: "2025-10-04",
      to: "2026-01-01",
    });
  });
});
