import type { MetricStripItem } from "@shared/ui/MetricStrip";
import type { WeekSummary } from "./build-week-summary";

/**
 * A week summary as the three cells of the page's `MetricStrip`.
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
      note: `计划时长 ${Math.round(summary.plannedMinutes)} 分钟`,
    },
    {
      label: "实际时长",
      value: String(Math.round(summary.actualMinutes)),
      unit: "分钟",
      ratio:
        summary.plannedMinutes > 0
          ? (summary.actualMinutes / summary.plannedMinutes) * 100
          : undefined,
    },
    {
      label: "完成率",
      value: rate === null ? "未记录" : `${rate}%`,
    },
  ];
}
