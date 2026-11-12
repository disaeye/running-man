import { PageCard } from "@shared/ui/Lovable";
import { NO_VALUE } from "@shared/lib/use-data-state";
import type { PeriodComparison, MetricKey } from "../lib/training-week";
import { periodLabel } from "../lib/training-week";

const ROWS: readonly { key: MetricKey; label: string; unit: string; digits: number }[] = [
  { key: "sessions", label: "次数", unit: "次", digits: 0 },
  { key: "distanceKm", label: "距离", unit: "km", digits: 1 },
  { key: "durationMin", label: "时长", unit: "min", digits: 0 },
  { key: "tss", label: "TSS", unit: "", digits: 0 },
];

/**
 * 周期执行汇总。
 *
 * 有计划时展示「计划 / 实际 / 差值」三列对照；无计划时折叠对照表，只给单行实际汇总与编排入口。
 */
export function TrainingPeriodSummary({
  comparison,
  weekOffset = 0,
  onPlan,
}: {
  readonly comparison: PeriodComparison;
  readonly weekOffset?: number;
  readonly onPlan?: () => void;
}) {
  const rangeLabel = periodLabel(comparison.from, comparison.to);
  const familyLabel = comparison.family === "all" ? "全部运动" : familyText(comparison.family);
  const title = summaryTitle(weekOffset, comparison.hasPlan);

  if (!comparison.hasPlan) {
    return (
      <PageCard testId="training-period-summary">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h2 className="eyebrow">{title}</h2>
          <span data-testid="period-range" className="num text-caption1 text-text-muted">
            {rangeLabel} · {familyLabel}
          </span>
        </div>
        <div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-4">
          {ROWS.map((row) => {
            const known = comparison.actualKnown[row.key];
            const val = comparison.metrics[row.key].actual;
            return (
              <div key={row.key} className="min-w-0">
                <div className="text-caption1 text-text-muted">{row.label}</div>
                <div className="num text-subheadline font-semibold text-text-primary">
                  {known ? `${val.toFixed(row.digits)}` : NO_VALUE}
                  {known && row.unit ? (
                    <span className="ml-0.5 text-caption1 font-normal text-text-muted">{row.unit}</span>
                  ) : null}
                </div>
              </div>
            );
          })}
        </div>
        <div className="mt-3 flex flex-wrap items-center justify-between gap-2 border-t border-border-subtle pt-2.5 text-caption1 text-text-muted">
          <span>该周尚未编排计划</span>
          {onPlan ? (
            <button
              type="button"
              onClick={onPlan}
              className="tactile inline-flex min-h-11 items-center font-medium text-accent-strong hover:underline"
            >
              {weekOffset === 0 ? "编排本周" : "编排该周"}
            </button>
          ) : null}
        </div>
      </PageCard>
    );
  }

  return (
    <PageCard testId="training-period-summary">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="eyebrow">{title}</h2>
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
    </PageCard>
  );
}

function summaryTitle(weekOffset: number, hasPlan: boolean): string {
  if (weekOffset === 0) return hasPlan ? "本周完成度" : "本周训练汇总";
  if (weekOffset > 0) return hasPlan ? "计划周概览" : "该周尚未排期";
  return hasPlan ? "该周完成度" : "该周训练汇总";
}

function SummaryRow({ row, comparison }: {
  readonly row: (typeof ROWS)[number];
  readonly comparison: PeriodComparison;
}) {
  const metric = comparison.metrics[row.key];
  const pKnown = comparison.plannedKnown[row.key];
  const aKnown = comparison.actualKnown[row.key];
  const bothKnown = pKnown && aKnown;
  const format = (value: number): string => value.toFixed(row.digits);
  return (
    <>
      <span className="text-text-secondary">{row.label}</span>
      <span className="num text-right text-text-primary">
        {pKnown ? format(metric.planned) : NO_VALUE}
        {pKnown && row.unit ? <span className="ml-0.5 text-text-muted">{row.unit}</span> : null}
      </span>
      <span className="num text-right text-text-primary">
        {aKnown ? format(metric.actual) : NO_VALUE}
        {aKnown && row.unit ? <span className="ml-0.5 text-text-muted">{row.unit}</span> : null}
      </span>
      <span className="num text-right text-text-secondary">
        {bothKnown ? signed(metric.delta, row.digits) : NO_VALUE}
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
