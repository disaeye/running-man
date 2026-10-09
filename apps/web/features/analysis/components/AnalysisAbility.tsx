"use client";

// Analysis tab · 表现 — summary + narrative + metrics + chart + radar + PR;
// race predictor under "更多" (secondary).

import { useMemo, useState } from "react";
import { ChevronDown, ChevronUp } from "lucide-react";
import { PerformanceAbility } from "@features/performance/components/PerformanceAbility";
import { PersonalRecordsList } from "@features/trends/components/PersonalRecordsList";
import { RacePredictor } from "@features/performance/components/RacePredictor";
import { useProfile, useZones } from "@features/settings/hooks/useProfile";
import { useAbility, formatPaceRange } from "@features/today/hooks/useAbility";
import { useWellness } from "@features/health/hooks/useWellness";
import {
  getAnalysisMetricTaxonomy,
  type AnalysisMetricDescriptor,
} from "@features/analysis/lib/analysis-metric-taxonomy";
import { useAnalysisRange } from "../lib/analysis-range";
import { AbilityRadar } from "./AbilityRadar";
import { AbilityMetricsRow } from "./AnalysisAbilityMetrics";
import { AnalysisPerformanceNarrative } from "./AnalysisPerformanceNarrative";
import { Card } from "@shared/ui/Card";

export function AnalysisAbility() {
  const [moreOpen, setMoreOpen] = useState(false);
  const { profile } = useProfile();
  const preferredSport = profile?.preferred_sport ?? null;
  const { data: ability } = useAbility();

  return (
    <div className="flex flex-col gap-4" data-testid="analysis-ability-root">
      <AbilitySummary />
      <AnalysisPerformanceNarrative />
      <AbilityMetricsRow />
      {ability?.data_available && ability.trainingPaces && (
        <Card padding="md" data-testid="analysis-training-paces">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <h3 className="text-title3 font-semibold text-text-primary">
                Daniels 训练配速
              </h3>
              <p className="mt-0.5 text-footnote text-text-muted">
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
      )}
      <PerformanceAbility />
      <div className="grid grid-cols-1 gap-4 xl:grid-cols-5">
        <div className="xl:col-span-3">
          <PersonalRecordsList sport={preferredSport} />
        </div>
        <div className="xl:col-span-2">
          <AbilityRadar sport={preferredSport} />
        </div>
      </div>

      <div data-testid="ability-more">
        <button
          type="button"
          className="focus-ring flex w-full min-h-[44px] items-center justify-between gap-3 rounded-2xl border border-border-subtle bg-[var(--glass-bg)] px-4 py-3 text-left transition-colors hover:bg-surface-overlay/60"
          aria-expanded={moreOpen}
          onClick={() => setMoreOpen((v) => !v)}
          data-testid="ability-more-toggle"
        >
          <div>
            <span className="block text-title3 font-semibold text-text-primary">
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
    </div>
  );
}

function AbilitySummary() {
  const { profile } = useProfile();
  const { zones } = useZones();
  const { range } = useAnalysisRange();
  const { data: wellness } = useWellness(range.from, range.to);

  const text = useMemo(
    () =>
      buildAbilitySummaryText({
        ftp: zones?.ftp ?? null,
        lthr: profile?.lthr ?? null,
        preferredSport: profile?.preferred_sport ?? null,
        thresholdPace: profile?.threshold_pace ?? null,
        vo2max: latestWellnessValue(wellness, "vo2max"),
      }),
    [wellness, zones, profile],
  );

  if (!text) return null;
  return (
    <Card padding="md" data-testid="analysis-ability-summary-card">
      <p className="text-caption1 font-medium uppercase tracking-wider text-text-muted">
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

function latestWellnessValue(
  data: ReturnType<typeof useWellness>["data"],
  key: "vo2max",
): number | null {
  for (let i = data.length - 1; i >= 0; i--) {
    const v = data[i]?.[key];
    if (v != null) return v;
  }
  return null;
}

type SummaryMetricValues = {
  readonly ftp: number | null;
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
    values.lthr != null ? `LTHR ${Math.round(values.lthr)} bpm` : null,
  vo2max: (values) =>
    values.vo2max != null
      ? `VO₂max ${values.vo2max.toFixed(1)} ml/kg/min`
      : null,
  raceSignal: (values) =>
    values.thresholdPace != null ? "临界速度信号已建立" : null,
  ftp: (values) =>
    values.ftp != null ? `FTP ${Math.round(values.ftp)} W` : null,
  power: (values) =>
    values.ftp != null ? `功率基准 ${Math.round(values.ftp)} W` : null,
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
