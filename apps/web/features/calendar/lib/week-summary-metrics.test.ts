import { describe, expect, it } from "vitest";
import { weekSummaryMetrics } from "@features/calendar/lib/week-summary-metrics";

/**
 * The three cells the calendar opens with.
 *
 * The distinction that matters: a week with no planned sessions shows 未记录
 * for 完成率 and no ratio bar, because "0 of 0 done" and "0 of 5 done" look the
 * same as a number but mean opposite things.
 */
describe("weekSummaryMetrics", () => {
  it("reports sessions, actual load and completion rate", () => {
    const items = weekSummaryMetrics({
      completed: 2,
      total: 4,
      plannedTss: 200,
      actualTss: 120,
    });
    const [sessions, load, rate] = items;

    expect(items.map((item) => item.label)).toEqual(["课次", "实际负荷", "完成率"]);
    expect(sessions?.label).toBe("课次");
    expect(sessions?.value).toBe("2/4");
    expect(sessions?.note).toBe("计划负荷 200 TSS");
    expect(load?.label).toBe("实际负荷");
    expect(load?.value).toBe("120");
    expect(load?.unit).toBe("TSS");
    expect(load?.ratio).toBe(60);
    expect(rate?.label).toBe("完成率");
    expect(rate?.value).toBe("50%");
  });

  it("says 未记录 instead of 0% when nothing was planned", () => {
    const [, load, rate] = weekSummaryMetrics({
      completed: 0,
      total: 0,
      plannedTss: 0,
      actualTss: 0,
    });

    expect(rate?.value).toBe("未记录");
    // No denominator, so no progress bar rather than a bar pinned at 0%.
    expect(load?.ratio).toBeUndefined();
  });

  it("keeps the ratio honest when unplanned activity overshoots the plan", () => {
    const [, load, rate] = weekSummaryMetrics({
      completed: 3,
      total: 2,
      plannedTss: 100,
      actualTss: 150,
    });

    expect(load?.ratio).toBe(150);
    expect(rate?.value).toBe("150%");
  });
});
