import { PageCard } from "@shared/ui/Lovable";
import type { PeriodComparison, MetricKey } from "../lib/training-week";
import { periodLabel } from "../lib/training-week";

const ROWS: readonly { key: MetricKey; label: string; unit: string; digits: number }[] = [
  { key: "sessions", label: "次数", unit: "次", digits: 0 },
  { key: "distanceKm", label: "距离", unit: "km", digits: 1 },
  { key: "durationMin", label: "时长", unit: "min", digits: 0 },
  { key: "tss", label: "TSS", unit: "", digits: 0 },
];

/** 本周完成度。四项指标共用 comparison 的范围与运动类别口径。 */
export function TrainingPeriodSummary({ comparison }: { comparison: PeriodComparison }) {
  const rangeLabel = periodLabel(comparison.from, comparison.to);
  const familyLabel = comparison.family === "all" ? "全部运动" : familyText(comparison.family);
  return (
    <PageCard testId="training-period-summary">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="eyebrow">本周完成度</h2>
        <span data-testid="period-range" className="num text-caption1 text-text-muted">
          {rangeLabel} · {familyLabel}
        </span>
      </div>
      <div className="mt-3 grid grid-cols-[minmax(0,1fr)_repeat(3,minmax(0,1fr))] gap-x-2 gap-y-1 text-caption1">
        <span className="text-text-muted">指标</span>
        <span className="text-right text-text-muted">计划</span>
        <span className="text-right text-text-muted">实际</span>
        <span className="text-right text-text-muted">差值</span>
        {ROWS.map((row) => (
          <SummaryRow key={row.key} row={row} comparison={comparison} />
        ))}
      </div>
      {!comparison.hasPlan ? (
        <p className="mt-2 text-caption1 text-text-muted">
          本周没有编排计划，实际数字照常统计；差值不适用。
        </p>
      ) : null}
    </PageCard>
  );
}

function SummaryRow({ row, comparison }: {
  readonly row: (typeof ROWS)[number];
  readonly comparison: PeriodComparison;
}) {
  const metric = comparison.metrics[row.key];
  const format = (value: number): string => value.toFixed(row.digits);
  return (
    <>
      <span className="text-text-secondary">{row.label}</span>
      <span className="num text-right text-text-primary">
        {comparison.hasPlan ? format(metric.planned) : "未编排"}
        {comparison.hasPlan && row.unit ? <span className="ml-0.5 text-text-muted">{row.unit}</span> : null}
      </span>
      <span className="num text-right text-text-primary">
        {format(metric.actual)}
        {row.unit ? <span className="ml-0.5 text-text-muted">{row.unit}</span> : null}
      </span>
      <span className="num text-right text-text-secondary">
        {comparison.hasPlan ? signed(metric.delta, row.digits) : "--"}
      </span>
    </>
  );
}

function signed(value: number, digits: number): string {
  const rounded = Number(value.toFixed(digits));
  return rounded > 0 ? `+${rounded.toFixed(digits)}` : rounded.toFixed(digits);
}

function familyText(family: string): string {
  if (family === "running") return "跑步";
  if (family === "strength") return "力量训练";
  if (family === "cycling") return "骑行";
  if (family === "swimming") return "游泳";
  return family;
}
