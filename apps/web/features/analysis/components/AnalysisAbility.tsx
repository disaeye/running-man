"use client";

// Analysis tab · 表现 — summary + narrative + metrics + chart + radar + PR;
// race predictor under "更多" (secondary).

import { useMemo, useState } from "react";
import { ChevronDown, ChevronUp } from "lucide-react";
import { PerformanceAbility } from "@features/performance/components/PerformanceAbility";
import { PersonalRecordsList } from "@features/trends/components/PersonalRecordsList";
import { RacePredictor } from "@features/performance/components/RacePredictor";
import { useProfile } from "@features/settings/hooks/useProfile";
import { useAbility, formatPaceRange } from "@features/today/hooks/useAbility";
import { useCurrentReadings } from "@features/health/lib/physiology-display";
import {
  getAnalysisMetricTaxonomy,
  type AnalysisMetricDescriptor,
} from "@features/analysis/lib/analysis-metric-taxonomy";
import { AbilityRadar } from "./AbilityRadar";
import { AbilityMetricsRow } from "./AnalysisAbilityMetrics";
import { AnalysisPerformanceNarrative } from "./AnalysisPerformanceNarrative";
import { Card } from "@shared/ui/Card";
import { HEART_RATE_UNIT } from "@shared/config/terms";
import { getSportConfig } from "@shared/config/sport-config";

export function AnalysisAbility() {
  const { profile } = useProfile();
  const preferredSport = profile?.preferred_sport ?? null;
  const showRunAnalysis = preferredSport != null && getSportConfig(preferredSport).isRun;

  return (
    <div className="flex flex-col gap-4" data-testid="analysis-ability-root">
      {showRunAnalysis && <AbilitySummary />}
      {showRunAnalysis && <AnalysisPerformanceNarrative />}
      {showRunAnalysis && <AbilityMetricsRow />}
      {showRunAnalysis && <TrainingPacesCard />}
      {showRunAnalysis && <PerformanceAbility />}
      {showRunAnalysis && (
        <div className="grid grid-cols-1 gap-4 xl:grid-cols-5">
          <div className="xl:col-span-3"><PersonalRecordsList /></div>
          <div className="xl:col-span-2"><AbilityRadar sport={preferredSport} /></div>
        </div>
      )}
      {showRunAnalysis && <RacePredictionPanel />}
    </div>
  );
}

function TrainingPacesCard() {
  const { data: ability } = useAbility();
  if (!ability?.data_available || !ability.trainingPaces) return null;
  return (
        <Card padding="md" data-testid="analysis-training-paces">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <h3 className="text-caption1 font-semibold text-text-secondary">
                Daniels 训练配速
              </h3>
              <p className="mt-0.5 text-caption1 text-text-muted">
                由当前 VDOT / 阈值配速推导
              </p>
            </div>
            {ability.vdot != null && (
              <span className="rounded-full bg-accent/10 px-2.5 py-1 text-caption1 font-medium text-accent-strong">
                VDOT {ability.vdot.toFixed(1)}
              </span>
            )}
          </div>
          <div className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-5 sm:gap-3">
            {(
              [
                ["easy", "E 轻松"],
                ["marathon", "M 马拉松"],
                ["threshold", "T 阈值"],
                ["interval", "I 间歇"],
                ["repetition", "R 重复"],
              ] as const
            ).map(([key, label]) => (
              <div
                key={key}
                className="rounded-xl bg-surface-overlay/60 px-3 py-3"
              >
                <p className="text-caption1 font-medium text-text-muted">{label}</p>
                <p className="mt-1 font-mono text-headline font-semibold tabular-nums text-text-primary">
                  {formatPaceRange(ability.trainingPaces?.[key] ?? null)}
                </p>
              </div>
            ))}
          </div>
        </Card>
  );
}

function RacePredictionPanel() {
  const [moreOpen, setMoreOpen] = useState(false);
  return (
    <div data-testid="ability-more">
        <button
          type="button"
          className="row-press focus-ring flex min-h-11 w-full items-center justify-between gap-3 rounded-2xl bg-surface-card px-4 py-3 text-left hover:bg-surface-overlay"
          aria-expanded={moreOpen}
          onClick={() => setMoreOpen((v) => !v)}
          data-testid="ability-more-toggle"
        >
          <div>
            <span className="block text-caption1 font-semibold text-text-secondary">
              比赛成绩预测
            </span>
            <span className="mt-0.5 block text-caption1 text-text-muted">
              基于当前能力向量的距离成绩估算
            </span>
          </div>
          <span className="flex items-center gap-1 text-caption1 text-text-muted">
            {moreOpen ? "收起" : "展开"}
            {moreOpen ? (
              <ChevronUp className="h-4 w-4" aria-hidden />
            ) : (
              <ChevronDown className="h-4 w-4" aria-hidden />
            )}
          </span>
        </button>
        {moreOpen ? (
          <div className="mt-3">
            <RacePredictor />
          </div>
        ) : null}
      </div>
  );
}

function AbilitySummary() {
  const { profile } = useProfile();
  const vo2max = useCurrentReadings().vo2max;

  const text = useMemo(
    () =>
      buildAbilitySummaryText({
        lthr: profile?.lthr ?? null,
        preferredSport: profile?.preferred_sport ?? null,
        thresholdPace: profile?.threshold_pace ?? null,
        vo2max: vo2max?.value ?? null,
      }),
    [vo2max, profile],
  );

  if (!text) return null;
  return (
    <Card padding="md" data-testid="analysis-ability-summary-card">
      <p className="text-caption1 font-medium text-text-muted">
        表现判断
      </p>
      <p
        className="mt-1.5 text-title3 font-semibold leading-snug text-text-primary"
        data-testid="analysis-ability-summary"
      >
        {text}
      </p>
    </Card>
  );
}

type SummaryMetricValues = {
  readonly lthr: number | null;
  readonly preferredSport: string | null;
  readonly thresholdPace: number | null;
  readonly vo2max: number | null;
};

function buildAbilitySummaryText(values: SummaryMetricValues): string | null {
  const taxonomy = getAnalysisMetricTaxonomy(values.preferredSport);
  const parts = taxonomy.primary.flatMap(
    (metric) => summaryTextForMetric(metric, values) ?? [],
  );
  return parts.length > 0 ? parts.join(" · ") : null;
}

const SUMMARY_TEXT_BY_METRIC: Record<
  AnalysisMetricDescriptor["key"],
  (values: SummaryMetricValues) => string | null
> = {
  thresholdPace: (values) =>
    values.thresholdPace != null
      ? `阈值配速 ${formatThresholdPace(values.thresholdPace)}`
      : null,
  lthr: (values) =>
    values.lthr != null ? `乳酸阈心率 ${Math.round(values.lthr)} ${HEART_RATE_UNIT}` : null,
  vo2max: (values) =>
    values.vo2max != null
      ? `最大摄氧量 ${values.vo2max.toFixed(1)} ml/kg/min`
      : null,
  raceSignal: (values) =>
    values.thresholdPace != null ? "临界速度信号已建立" : null,
  trainingLoad: () => null,
  heartRate: () => null,
  bodyWeight: () => null,
};

function summaryTextForMetric(
  metric: AnalysisMetricDescriptor,
  values: SummaryMetricValues,
): string | null {
  return SUMMARY_TEXT_BY_METRIC[metric.key](values);
}

function formatThresholdPace(seconds: number | null): string {
  if (seconds == null || seconds <= 0) return "--";
  const mins = Math.floor(seconds / 60);
  const secs = Math.round(seconds % 60)
    .toString()
    .padStart(2, "0");
  return `${mins}'${secs}"/km`;
}
