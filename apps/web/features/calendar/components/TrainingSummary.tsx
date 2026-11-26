import { PageCard } from "@shared/ui/Card";
import { Bar } from "@shared/ui/MetricBar";
import { NO_VALUE } from "@shared/lib/use-data-state";
import type { PeriodComparison, MetricKey } from "../lib/training-week";
import { periodLabel } from "../lib/training-week";

const ROWS: readonly { key: MetricKey; label: string; unit: string; digits: number; tone: string }[] = [
  { key: "sessions", label: "次数", unit: "次", digits: 0, tone: "bg-accent-strong" },
  { key: "distanceKm", label: "距离", unit: "km", digits: 1, tone: "bg-sport-run" },
  { key: "durationMin", label: "时长", unit: "min", digits: 0, tone: "bg-fitness" },
  { key: "tss", label: "TSS", unit: "", digits: 0, tone: "bg-warn" },
];

/**
 * 周期执行汇总（对标 COROS / Garmin 周训练量达成面板）：
 * 有计划时展示「计划 vs 实际」进度条与偏差；无计划时以 2×2 下沉遥测格展示实际总量。
 * `periodKind` 决定文案说「周」还是「月」，`isCurrentPeriod` 决定说「本」还是「该」。
 */
export function TrainingPeriodSummary({
  comparison,
  periodKind,
  isCurrentPeriod,
  onPlan,
}: {
  readonly comparison: PeriodComparison;
  readonly periodKind: "week" | "month";
  readonly isCurrentPeriod: boolean;
  readonly onPlan?: () => void;
}) {
  const rangeLabel = periodLabel(comparison.from, comparison.to);
  const familyLabel = comparison.family === "all" ? "全部运动" : familyText(comparison.family);
  const noun = periodKind === "week" ? "周" : "月";
  const title = summaryTitle(noun, isCurrentPeriod, comparison.hasPlan);

  if (!comparison.hasPlan) {
    return (
      <PageCard testId="training-period-summary">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h2 className="eyebrow">{title}</h2>
          <span data-testid="period-range" className="num text-caption1 text-text-muted">
            {rangeLabel} · {familyLabel}
          </span>
        </div>
        <div className="mt-3 grid grid-cols-2 gap-2.5 sm:grid-cols-4 lg:grid-cols-2">
          {ROWS.map((row) => {
            const known = comparison.actualKnown[row.key];
            const val = comparison.metrics[row.key].actual;
            return (
              <div key={row.key} className="min-w-0 rounded-xl bg-surface-overlay p-2.5">
                <div className="text-caption1 text-text-muted">{row.label}</div>
                <div className="num mt-0.5 font-mono text-title2 font-semibold tabular-nums text-text-primary">
                  {known ? `${val.toFixed(row.digits)}` : NO_VALUE}
                  {known && row.unit ? (
                    <span className="ml-0.5 font-sans text-caption1 font-normal text-text-muted">{row.unit}</span>
                  ) : null}
                </div>
              </div>
            );
          })}
        </div>
        <div className="mt-3 flex flex-wrap items-center justify-between gap-2 border-t border-border-subtle pt-2.5 text-caption1 text-text-muted">
          <span>该{noun}尚未编排计划</span>
          {onPlan ? (
            <button
              type="button"
              onClick={onPlan}
              className="tactile inline-flex min-h-11 items-center font-medium text-accent-strong hover:underline"
            >
              {isCurrentPeriod ? `编排本${noun}` : `编排该${noun}`}
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
      <div className="mt-3 space-y-2.5">
        {ROWS.map((row) => (
          <SummaryProgressRow key={row.key} row={row} comparison={comparison} />
        ))}
      </div>
    </PageCard>
  );
}

function summaryTitle(noun: string, isCurrentPeriod: boolean, hasPlan: boolean): string {
  if (isCurrentPeriod) return hasPlan ? `本${noun}完成度` : `本${noun}训练汇总`;
  return hasPlan ? `该${noun}完成度` : `该${noun}训练汇总`;
}

function SummaryProgressRow({ row, comparison }: {
  readonly row: (typeof ROWS)[number];
  readonly comparison: PeriodComparison;
}) {
  const metric = comparison.metrics[row.key];
  const pKnown = comparison.plannedKnown[row.key];
  const aKnown = comparison.actualKnown[row.key];
  const bothKnown = pKnown && aKnown;
  const format = (value: number): string => value.toFixed(row.digits);
  const pct = bothKnown && metric.planned > 0
    ? Math.min(999, Math.round((metric.actual / metric.planned) * 100))
    : null;
  const barMax = Math.max(metric.actual, metric.planned, 1);

  return (
    <div className="rounded-xl bg-surface-overlay p-2.5">
      <div className="flex items-baseline justify-between gap-2 text-caption1">
        <span className="font-medium text-text-secondary">{row.label}</span>
        <div className="flex items-baseline gap-2">
          <span className="num font-mono tabular-nums text-text-primary">
            <span className="font-semibold">{aKnown ? format(metric.actual) : NO_VALUE}</span>
            {pKnown ? (
              <span className="text-text-muted"> / {format(metric.planned)}</span>
            ) : null}
            {(aKnown || pKnown) && row.unit ? (
              <span className="ml-0.5 font-sans text-text-muted">{row.unit}</span>
            ) : null}
          </span>
          {bothKnown ? (
            <span className="num rounded-full bg-surface-card px-1.5 py-0.5 font-mono text-caption1 text-text-secondary">
              {pct != null ? `${pct}%` : signed(metric.delta, row.digits)}
            </span>
          ) : null}
        </div>
      </div>
      {pKnown ? (
        <div className="mt-1.5">
          <Bar value={aKnown ? metric.actual : 0} max={barMax} tone={row.tone} />
        </div>
      ) : null}
    </div>
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
