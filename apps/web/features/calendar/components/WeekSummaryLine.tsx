import { NO_VALUE } from "@shared/lib/use-data-state";
import { Stat, StatGrid } from "@shared/ui/Section";
import type { WeekSummary } from "../lib/build-week-summary";

/**
 * The week's four numbers as the page's stat grid.
 *
 * The same grid the home screen uses for the day's prescription, so the two
 * schedule screens open with the same shape: numbers first, then the week.
 */
export function WeekSummaryLine({ summary }: { readonly summary: WeekSummary }) {
  const rate =
    summary.total > 0 ? Math.round((summary.completed / summary.total) * 100) : null;

  const facts = [
    {
      label: "课次",
      value: summary.total > 0 ? `${summary.completed}/${summary.total}` : NO_VALUE,
      unit: undefined,
    },
    {
      label: "实际负荷",
      value: summary.actualTss > 0 ? String(Math.round(summary.actualTss)) : NO_VALUE,
      unit: "TSS",
    },
    {
      label: "计划负荷",
      value: summary.plannedTss > 0 ? String(Math.round(summary.plannedTss)) : NO_VALUE,
      unit: "TSS",
    },
    {
      label: "完成率",
      value: rate != null ? `${rate}%` : NO_VALUE,
      unit: undefined,
    },
  ];

  return (
    <StatGrid cols={4} testId="week-summary">
      {facts.map((fact) => (
        <Stat key={fact.label} label={fact.label} value={fact.value} unit={fact.unit} />
      ))}
    </StatGrid>
  );
}
