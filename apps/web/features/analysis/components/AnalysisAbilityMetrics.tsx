"use client";

import { useMemo } from "react";
import { ArrowDown, ArrowUp, Minus } from "lucide-react";
import { Card } from "@shared/ui/Card";
import { useProfile } from "@features/settings/hooks/useProfile";
import { useWellness } from "@features/health/hooks/useWellness";
import {
  getAnalysisMetricTaxonomy,
  type AnalysisMetricDescriptor,
  type AnalysisSportFamily,
} from "@features/analysis/lib/analysis-metric-taxonomy";
import { computeRange, toISODate } from "@shared/lib/format";

type MetricValues = {
  readonly family: AnalysisSportFamily;
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
  const range = useMemo(() => computeRange(60), []);
  const weekAgo = useMemo(() => {
    const date = new Date();
    date.setDate(date.getDate() - 7);
    return toISODate(date);
  }, []);
  const { data: wellness } = useWellness(range.from, range.to);
  const { profile } = useProfile();
  const metricValues = useMemo(
    () => buildMetricValues({ profile, weekAgo, wellness }),
    [profile, weekAgo, wellness]);
  const taxonomy = getAnalysisMetricTaxonomy(profile?.preferred_sport ?? null);
  const values = { ...metricValues, family: taxonomy.family };
  return (
    <Card padding="md" data-testid="analysis-ability-metrics">
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {taxonomy.primary.map((metric) => (
          <MetricCardWithDelta
            key={metric.key}
            {...cardProps(metric, values)}
            data-testid={`primary-${taxonomy.family}-${metric.key}-card`}
          />
        ))}
      </div>
    </Card>
  );
}

function buildMetricValues({ profile, weekAgo, wellness }: {
  readonly profile: { readonly lthr?: number | null; readonly sex?: string | null; readonly threshold_pace?: number | null } | null | undefined;
  readonly weekAgo: string;
  readonly wellness: readonly WellnessRow[];
}): Omit<MetricValues, "family"> {
  return {
    lthr: profile?.lthr ?? null,
    thresholdPace: profile?.threshold_pace ?? null,
    vo2Latest: latestVo2(wellness),
    vo2Prior: latestVo2Before(wellness, weekAgo),
    vo2Note: vo2ClassificationNote(profile?.sex),
  };
}

const CARD_BUILDERS = {
  thresholdPace: thresholdPaceCard,
  lthr: lthrCard,
  vo2max: vo2Card,
  raceSignal: raceSignalCard,
  // Cycling remains a resolvable sport family — rides are in the data — but
  // power support has been removed, so there is no FTP and no wattage to show.
  // These say so instead of printing a number derived from nothing.
  ftp: () => unavailableMetric("FTP", "功率基准已不再支持。"),
  power: () => unavailableMetric("功率", "功率数据已不再支持。"),
  trainingLoad: () => unavailableMetric("训练负荷", "需要训练负荷历史后显示。"),
  heartRate: () => unavailableMetric("心率", "需要心率历史后显示。"),
  bodyWeight: () => unavailableMetric("体重", "需要体重记录后显示。"),
};

function cardProps(metric: AnalysisMetricDescriptor, values: MetricValues): CardProps {
  return CARD_BUILDERS[metric.key](values);
}

function thresholdPaceCard(values: MetricValues): CardProps {
  return {
    label: "阈值配速",
    tooltip: "乳酸阈值配速 — 1小时比赛配速 (min/km)",
    value: formatThresholdPace(values.thresholdPace),
    current: values.thresholdPace,
    prior: null,
    unit: "min/km",
    note: values.thresholdPace == null ? "缺少阈值配速数据：填写生理参数，或同步足够的跑步 GPS 最佳努力后自动估算。" : undefined,
  };
}

function lthrCard(values: MetricValues): CardProps {
  return {
    label: "LTHR",
    tooltip: "乳酸阈值心率 — 1小时比赛心率 (bpm)",
    value: values.lthr != null ? `${Math.round(values.lthr)}` : "--",
    current: values.lthr,
    prior: null,
    color: "text-hr-rest",
    unit: "bpm",
    note: values.lthr == null ? "缺少乳酸阈值心率：可在生理设置中填写或自动估算。" : undefined,
  };
}

function vo2Card(values: MetricValues): CardProps {
  return {
    label: "VO₂max",
    tooltip: "最大摄氧量 (ml/kg/min) — 有氧能力金标准",
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

function MetricCardWithDelta(props: CardProps & { readonly "data-testid": string }) {
  const delta = props.current != null && props.prior != null ? props.current - props.prior : null;
  const deltaDisplay = buildDeltaDisplay(delta);
  const absDelta = delta != null ? Math.abs(delta) : 0;
  return (
    <div
      data-testid={props["data-testid"]}
      className="flex flex-col gap-1 rounded-xl bg-surface-overlay/55 px-3 py-3"
    >
      <p className="text-caption1 font-medium text-text-muted">{props.label}</p>
      <p
        className={`mt-0.5 flex items-baseline gap-1 font-mono text-title2 font-semibold tabular-nums ${props.color ?? "text-text-primary"}`}
      >
        <span>{props.value}</span>
        {props.unit && (
          <span className="text-footnote font-medium text-text-secondary">{props.unit}</span>
        )}
      </p>
      <div className="mt-1 flex items-baseline gap-1 text-caption1">
        {deltaDisplay && props.prior != null ? (
          <span
            className={`inline-flex items-center gap-1 font-mono font-semibold ${deltaDisplay.tone}`}
          >
            <deltaDisplay.Icon className="h-3 w-3" aria-hidden />
            {absDelta.toFixed(absDelta < 1 ? 2 : 1)} {props.unit ?? ""}
          </span>
        ) : (
          <span className="text-text-muted">较上周暂无历史</span>
        )}
        <span className="text-text-muted">vs 上周</span>
      </div>
      {props.note && (
        <p className="mt-1 text-caption2 text-text-muted">{props.note}</p>
      )}
    </div>
  );
}

function buildDeltaDisplay(delta: number | null): { readonly Icon: typeof ArrowUp; readonly tone: string } | null {
  if (delta == null) return null;
  if (delta > 0) return { Icon: ArrowUp, tone: "text-success" };
  if (delta < 0) return { Icon: ArrowDown, tone: "text-error" };
  return { Icon: Minus, tone: "text-text-muted" };
}

function unavailableMetric(label: string, note: string): CardProps {
  return { label, tooltip: note, value: "--", current: null, prior: null, note };
}

function formatThresholdPace(seconds: number | null): string {
  if (seconds == null || seconds <= 0) return "--";
  const mins = Math.floor(seconds / 60);
  const secs = Math.round(seconds % 60).toString().padStart(2, "0");
  return `${mins}'${secs}"/km`;
}

function vo2ClassificationNote(sex: string | null | undefined): string {
  if (sex === "male" || sex === "M") return "VO₂ 分类基于男性标准";
  if (sex === "female" || sex === "F") return "VO₂ 分类基于女性标准";
  return "VO₂ 分类基于混合性别标准";
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
