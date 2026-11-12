"use client";

import { useMemo } from "react";
import { ArrowDown, ArrowUp, Minus } from "lucide-react";
import { Card } from "@shared/ui/Card";
import { useProfile } from "@features/settings/hooks/useProfile";
import { useWellnessHistory } from "@features/health/lib/physiology-display";
import {
  getAnalysisMetricTaxonomy,
  type AnalysisMetricDescriptor,
} from "@features/analysis/lib/analysis-metric-taxonomy";
import { HEART_RATE_UNIT } from "@shared/config/terms";

type MetricValues = {
  readonly lthr: number | null;
  readonly thresholdPace: number | null;
  readonly vo2Latest: number | null;
  readonly vo2Prior: number | null;
  readonly vo2Note: string;
};

type CardProps = {
  readonly label: string;
  readonly tooltip: string;
  readonly value: string;
  readonly current: number | null;
  readonly prior: number | null;
  readonly color?: string;
  readonly unit?: string;
  readonly note?: string;
};

type WellnessRow = {
  readonly day: string;
  readonly vo2max: number | null;
};

export function AbilityMetricsRow() {
  const wellness = useWellnessHistory();
  const weekAgo = useMemo(() => {
    const date = new Date();
    date.setDate(date.getDate() - 7);
    return date.toISOString().slice(0, 10);
  }, []);
  const { profile } = useProfile();
  const metricValues = useMemo(
    () => buildMetricValues({ profile, weekAgo, wellness }),
    [profile, weekAgo, wellness]);
  const taxonomy = getAnalysisMetricTaxonomy(profile?.preferred_sport ?? null);
  const values = metricValues;
  const cards = taxonomy.primary.filter(isVisibleMetric).map((metric) => ({
    key: metric.key,
    testId: `primary-${taxonomy.family}-${metric.key}-card`,
    props: cardProps(metric, values),
  }));
  const notes = cards.filter((card) => card.props.note);
  return (
    <Card padding="md" data-testid="analysis-ability-metrics">
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {cards.map((card) => (
          <MetricCard key={card.key} {...card.props} data-testid={card.testId} />
        ))}
      </div>
      {notes.length > 0 && (
        <ul className="mt-3 space-y-1 border-t border-border-subtle pt-3" data-testid="analysis-ability-notes">
          {notes.map((card) => (
            <li key={card.key} className="text-caption1 leading-snug text-text-muted">
              <span className="text-text-secondary">{card.props.label}：</span>
              {card.props.note}
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}

function buildMetricValues({ profile, weekAgo, wellness }: {
  readonly profile: { readonly lthr?: number | null; readonly sex?: string | null; readonly threshold_pace?: number | null } | null | undefined;
  readonly weekAgo: string;
  readonly wellness: readonly WellnessRow[];
}): MetricValues {
  return {
    lthr: profile?.lthr ?? null,
    thresholdPace: profile?.threshold_pace ?? null,
    vo2Latest: latestVo2(wellness),
    vo2Prior: latestVo2Before(wellness, weekAgo),
    vo2Note: vo2ClassificationNote(profile?.sex),
  };
}

type VisibleMetric = AnalysisMetricDescriptor & {
  readonly key: "thresholdPace" | "lthr" | "vo2max" | "raceSignal";
};

const CARD_BUILDERS: Record<VisibleMetric["key"], (values: MetricValues) => CardProps> = {
  thresholdPace: thresholdPaceCard,
  lthr: lthrCard,
  vo2max: vo2Card,
  raceSignal: raceSignalCard,
};

function isVisibleMetric(metric: AnalysisMetricDescriptor): metric is VisibleMetric {
  return metric.key in CARD_BUILDERS;
}

function cardProps(metric: VisibleMetric, values: MetricValues): CardProps {
  return CARD_BUILDERS[metric.key](values);
}

function thresholdPaceCard(values: MetricValues): CardProps {
  return {
    label: "阈值配速",
    tooltip: "乳酸阈值配速 — 约一小时全力配速 (min/km)",
    value: formatPaceValue(values.thresholdPace),
    current: values.thresholdPace,
    prior: null,
    unit: "min/km",
    note: values.thresholdPace == null ? "缺少阈值配速数据：填写生理参数，或同步足够的跑步 GPS 最佳努力后自动估算。" : undefined,
  };
}

function lthrCard(values: MetricValues): CardProps {
  return {
    label: "乳酸阈心率",
    tooltip: `约一小时全力可持续的心率 (${HEART_RATE_UNIT})`,
    value: values.lthr != null ? `${Math.round(values.lthr)}` : "--",
    current: values.lthr,
    prior: null,
    color: "text-hr-rest",
    unit: HEART_RATE_UNIT,
    note: values.lthr == null ? "缺少乳酸阈值心率：可在生理设置中填写或自动估算。" : undefined,
  };
}

function vo2Card(values: MetricValues): CardProps {
  return {
    label: "最大摄氧量",
    tooltip: "有氧能力指标 (ml/kg/min)",
    value: values.vo2Latest != null ? values.vo2Latest.toFixed(1) : "--",
    current: values.vo2Latest,
    prior: values.vo2Prior,
    color: "text-accent-strong",
    unit: "ml/kg/min",
    note: values.vo2Note,
  };
}

function raceSignalCard(values: MetricValues): CardProps {
  return {
    label: "比赛能力信号",
    tooltip: "比赛、最佳努力或临界速度模型给出的跑步表现信号",
    value: values.thresholdPace != null ? "已建立" : "--",
    current: null,
    prior: null,
    color: values.thresholdPace != null ? "text-success" : "text-text-primary",
    note: values.thresholdPace != null
      ? `临界速度模型支撑阈值配速 ${formatThresholdPace(values.thresholdPace)}`
      : "同步足够的跑步 GPS 最佳努力后，会生成比赛能力信号。",
  };
}

function MetricCard(props: CardProps & { readonly "data-testid": string }) {
  const delta = props.current != null && props.prior != null ? props.current - props.prior : null;
  const deltaDisplay = buildDeltaDisplay(delta);
  const absDelta = delta != null ? Math.abs(delta) : 0;
  return (
    <div
      data-testid={props["data-testid"]}
      className="flex flex-col gap-1 rounded-xl bg-surface-overlay/55 px-3 py-3"
    >
      <p className="truncate text-caption1 font-medium text-text-muted">{props.label}</p>
      <p
        className={`flex items-baseline gap-1 whitespace-nowrap font-mono text-title2 font-semibold tabular-nums ${props.color ?? "text-text-primary"}`}
      >
        <span>{props.value}</span>
        {props.unit && (
          <span className="text-footnote font-medium text-text-secondary">{props.unit}</span>
        )}
      </p>
      {deltaDisplay && props.prior != null ? (
        <span
          className={`flex items-center gap-1 font-mono text-caption1 font-semibold ${deltaDisplay.tone}`}
        >
          <deltaDisplay.Icon className="size-3" aria-hidden />
          较上周 {absDelta.toFixed(absDelta < 1 ? 2 : 1)}
        </span>
      ) : null}
    </div>
  );
}

function buildDeltaDisplay(delta: number | null): { readonly Icon: typeof ArrowUp; readonly tone: string } | null {
  if (delta == null) return null;
  if (delta > 0) return { Icon: ArrowUp, tone: "text-success" };
  if (delta < 0) return { Icon: ArrowDown, tone: "text-error" };
  return { Icon: Minus, tone: "text-text-muted" };
}

function formatThresholdPace(seconds: number | null): string {
  if (seconds == null || seconds <= 0) return "--";
  const mins = Math.floor(seconds / 60);
  const secs = Math.round(seconds % 60).toString().padStart(2, "0");
  return `${mins}'${secs}"/km`;
}

/** The card prints the unit as its own token, so the value carries only the clock. */
function formatPaceValue(seconds: number | null): string {
  if (seconds == null || seconds <= 0) return "--";
  const mins = Math.floor(seconds / 60);
  const secs = Math.round(seconds % 60).toString().padStart(2, "0");
  return `${mins}'${secs}"`;
}

function vo2ClassificationNote(sex: string | null | undefined): string {
  if (sex === "male" || sex === "M") return "分类参考男性标准";
  if (sex === "female" || sex === "F") return "分类参考女性标准";
  return "未填写性别，按男女合并标准分类";
}

function latestVo2(rows: readonly WellnessRow[]): number | null {
  return latestNumeric(rows.map((row) => ({ day: row.day, value: row.vo2max })))?.value ?? null;
}

function latestVo2Before(rows: readonly WellnessRow[], day: string): number | null {
  return latestVo2(rows.filter((row) => row.day <= day));
}

function latestNumeric(
  rows: readonly { readonly day: string; readonly value: number | null }[],
): { readonly day: string; readonly value: number } | null {
  const sorted = [...rows].sort((left, right) => left.day.localeCompare(right.day));
  for (let index = sorted.length - 1; index >= 0; index--) {
    const row = sorted[index];
    if (row?.value != null) return { day: row.day, value: row.value };
  }
  return null;
}
