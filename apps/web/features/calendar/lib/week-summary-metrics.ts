import type { MetricStripItem } from "@shared/ui/MetricStrip";
import type { WeekSummary } from "./build-week-summary";

/**
 * A week summary as the three cells of the page's `MetricStrip`.
 *
 * Three, not four: `plannedTss` is the denominator of both load and completion,
 * so it rides under 课次 as the note that explains where the numbers came from
 * instead of taking a cell of its own.
 *
 * 完成率 has no honest value before the week plans anything, so it says 未记录
 * rather than 0% — a zero would read as "planned and missed".
 */
export function weekSummaryMetrics(summary: WeekSummary): MetricStripItem[] {
  const rate =
    summary.total > 0 ? Math.round((summary.completed / summary.total) * 100) : null;

  return [
    {
      label: "课次",
      value: `${summary.completed}/${summary.total}`,
      note: `计划负荷 ${Math.round(summary.plannedTss)} TSS`,
    },
    {
      label: "实际负荷",
      value: String(Math.round(summary.actualTss)),
      unit: "TSS",
      ratio:
        summary.plannedTss > 0
          ? (summary.actualTss / summary.plannedTss) * 100
          : undefined,
    },
    {
      label: "完成率",
      value: rate === null ? "未记录" : `${rate}%`,
    },
  ];
}
