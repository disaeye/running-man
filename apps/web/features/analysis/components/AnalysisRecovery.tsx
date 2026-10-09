"use client";

// Recovery charts for the load tab (collapsed by default at page shell).
// Range from page-level provider only — no second range control.

import { useMemo } from "react";
import { Card } from "@shared/ui/Card";
import { ChartShell } from "@shared/ui/ChartShell";
import { SleepAnalysis } from "@features/health/components/SleepAnalysis";
import { RestingHRTrend } from "@features/health/components/RestingHRTrend";
import { VO2maxTrend } from "@features/health/components/VO2maxTrend";
import { HealthChart } from "@features/health/components/HealthChart";
import { TrainingRecoveryCorrelation } from "@features/health/components/TrainingRecoveryCorrelation";
import { WellnessMetricChart } from "@features/health/components/WellnessMetricChart";
import { BloodPressureChart } from "@features/health/components/BloodPressureChart";
import { NutritionChart } from "@features/health/components/NutritionChart";
import { SubjectiveRatingsChart } from "@features/health/components/SubjectiveRatingsChart";
import { MenstrualPhaseStrip } from "@features/health/components/MenstrualPhaseStrip";
import { useWellness } from "@features/health/hooks/useWellness";
import { usePmcData, type PmcPoint } from "@features/pmc/hooks/usePmcData";
import { useReadiness } from "@features/today/hooks/useReadiness";
import { toISODate } from "@shared/lib/format";
import { useAnalysisRange } from "../lib/analysis-range";
import {
  ReadinessDriverHistory,
  RecoveryDiagnosisCard,
  RecoverySparseState,
} from "./AnalysisRecoveryDiagnosis";

export function AnalysisRecovery() {
  const { range } = useAnalysisRange();
  const today = toISODate(new Date());
  const { data: wellness, loading, error } = useWellness(range.from, range.to);
  const { data: loads } = usePmcData(range.from, range.to);
  const { data: readiness } = useReadiness(today);

  const latestLoad = useMemo(() => latestByDay(loads), [loads]);
  const bodyState = recoveryBodyState({
    error,
    loading,
    sampleCount: wellness.length,
  });

  return (
    <div className="flex flex-col gap-4" data-testid="analysis-recovery-root">
      {bodyState === "error" && (
        <Card
          padding="md"
          className="text-subheadline text-error"
          data-testid="analysis-recovery-error"
        >
          {error}
        </Card>
      )}

      {bodyState === "sparse" && <RecoverySparseState />}

      {bodyState === "ready" && (
        <>
          <RecoveryDiagnosisCard
            wellness={wellness}
            latestLoad={latestLoad}
            readiness={readiness?.local_readiness ?? null}
          />
          {readiness && (
            <ReadinessDriverHistory readiness={readiness.local_readiness} />
          )}

          <ChartShell
            title="综合健康趋势"
            subtitle="RHR / 体重"
            provenance={`${range.from} → ${range.to} · ${wellness.length} 天`}
          >
            <HealthChart data={wellness} />
          </ChartShell>

          <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
            <ChartShell title="睡眠" subtitle="小时/晚">
              <SleepAnalysis data={wellness} />
            </ChartShell>
            <ChartShell title="静息心率" subtitle="bpm">
              <RestingHRTrend data={wellness} />
            </ChartShell>
          </div>
          <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
            <ChartShell title="VO₂max" subtitle="ml/kg/min">
              <VO2maxTrend data={wellness} />
            </ChartShell>
            <TrainingRecoveryCorrelation wellness={wellness} loads={loads} />
          </div>

          <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
            <ChartShell title="血氧" subtitle="%">
              <WellnessMetricChart metricKey="spo2" field="spo2" data={wellness} color="success" />
            </ChartShell>
            <ChartShell title="呼吸频率" subtitle="次/分">
              <WellnessMetricChart
                metricKey="respiration_rate"
                field="respiration_rate"
                data={wellness}
                color="accent"
              />
            </ChartShell>
          </div>
          <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
            <ChartShell title="血压" subtitle="mmHg">
              <BloodPressureChart data={wellness} />
            </ChartShell>
            <ChartShell title="步数" subtitle="步/日">
              <WellnessMetricChart metricKey="steps" field="steps" data={wellness} color="move" />
            </ChartShell>
          </div>
          <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
            <ChartShell title="HRV 趋势" subtitle="ms">
              <WellnessMetricChart metricKey="hrv" field="hrv" data={wellness} color="hrRest" />
            </ChartShell>
            <ChartShell title="HRV SDNN" subtitle="ms">
              <WellnessMetricChart
                metricKey="hrv_sdnn"
                field="hrv_sdnn"
                data={wellness}
                color="exercise"
              />
            </ChartShell>
          </div>
          <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
            <ChartShell title="睡眠平均心率" subtitle="bpm">
              <WellnessMetricChart
                metricKey="avg_sleeping_hr"
                field="avg_sleeping_hr"
                data={wellness}
                color="hrRest"
              />
            </ChartShell>
            <ChartShell title="营养摄入" subtitle="kcal / g">
              <NutritionChart data={wellness} />
            </ChartShell>
          </div>
          <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
            <ChartShell title="体脂率" subtitle="%">
              <WellnessMetricChart
                metricKey="body_fat_pct"
                field="body_fat_pct"
                data={wellness}
                color="weight"
              />
            </ChartShell>
            <ChartShell title="主观感受" subtitle="1–4 等级">
              <SubjectiveRatingsChart data={wellness} />
            </ChartShell>
          </div>
          <ChartShell title="生理周期" subtitle="Intervals.icu 阶段编号">
            <MenstrualPhaseStrip data={wellness} />
          </ChartShell>
        </>
      )}
    </div>
  );
}

function recoveryBodyState({
  error,
  loading,
  sampleCount,
}: {
  readonly error: string | null;
  readonly loading: boolean;
  readonly sampleCount: number;
}): "error" | "sparse" | "ready" {
  if (error) return "error";
  return sampleCount >= 3 || loading ? "ready" : "sparse";
}

function latestByDay(points: PmcPoint[]): PmcPoint | null {
  return [...points].sort((a, b) => a.day.localeCompare(b.day)).at(-1) ?? null;
}

export { LinkButton } from "./AnalysisLink";
