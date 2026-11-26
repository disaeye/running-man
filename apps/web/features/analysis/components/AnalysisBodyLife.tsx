"use client";

import { useState } from "react";
import { ChevronDown, ChevronUp } from "lucide-react";
import { PageCard } from "@shared/ui/Card";
import { Stat } from "@shared/ui/StatCell";
import { Tag } from "@shared/ui/Badge";
import { LovableChart } from "@shared/ui/LovableChart";
import { useWellness } from "@features/health/hooks/useWellness";
import { SleepAnalysis } from "@features/health/components/SleepAnalysis";
import { BloodPressureChart } from "@features/health/components/BloodPressureChart";
import { NutritionChart } from "@features/health/components/NutritionChart";
import { SubjectiveRatingsChart, hasSubjectiveData } from "@features/health/components/SubjectiveRatingsChart";
import { MenstrualPhaseStrip } from "@features/health/components/MenstrualPhaseStrip";
import { WellnessMetricChart } from "@features/health/components/WellnessMetricChart";
import { NO_VALUE } from "@shared/lib/use-data-state";

export function AnalysisBodyLife({ from, to }: { from: string; to: string }) {
  const wellness = useWellness(from, to);
  const [showMoreMetrics, setShowMoreMetrics] = useState(false);

  const weight = wellness.data.filter((point) => point.weight != null);
  const bodyFat = wellness.data.filter((point) => point.body_fat_pct != null).at(-1)?.body_fat_pct ?? null;
  const latest = weight.at(-1)?.weight ?? null;
  const weightDelta = weight.length > 1 ? latest! - weight[0]!.weight! : null;
  const spanDays =
    weight.length > 1
      ? Math.max(1, Math.round((Date.parse(weight.at(-1)!.day) - Date.parse(weight[0]!.day)) / 86400000))
      : 0;
  const spanLabel = spanDays >= 14 ? `${Math.round(spanDays / 7)} 周` : `${spanDays} 天`;

  return (
    <div className="space-y-4" data-testid="analysis-body">
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-12 lg:items-start">
        <div className="space-y-4 lg:col-span-7">
          <PageCard title="体重 · 体脂率" action={<Tag>每日称重记录</Tag>}>
            <div className="mb-2 grid grid-cols-2 gap-2">
              <Stat label="体重" value={latest != null ? latest.toFixed(1) : NO_VALUE} unit={latest != null ? "kg" : undefined} sub={weightDelta != null ? `近 ${spanLabel} ${weightDelta > 0 ? "+" : ""}${weightDelta.toFixed(1)} kg` : undefined} />
              <Stat label="体脂率" value={bodyFat != null ? bodyFat.toFixed(1) : NO_VALUE} unit={bodyFat != null ? "%" : undefined} />
            </div>
            <LovableChart
              h={100}
              labels={weight.map((point) => point.day.slice(5))}
              provenance={`数据来源：健康日志 · ${from} 至 ${to}`}
              lines={[{ data: weight.map((point) => point.weight ?? null), cls: "stroke-accent-strong", label: "体重", format: (v) => `${v.toFixed(1)} kg` }]}
              emptyMessage="所选范围内暂无体重记录"
            />
          </PageCard>
        </div>

        <div className="space-y-4 lg:col-span-5">
          <SleepAnalysis data={wellness.data} />
          {hasSubjectiveData(wellness.data) ? (
            <PageCard>
              <SubjectiveRatingsChart data={wellness.data} />
            </PageCard>
          ) : null}
        </div>
      </div>

      <div className="space-y-3">
        <button
          type="button"
          onClick={() => setShowMoreMetrics((prev) => !prev)}
          aria-expanded={showMoreMetrics}
          className="flex min-h-11 w-full items-center justify-between rounded-2xl border border-dashed border-border-default px-3.5 py-2.5 text-left text-xs text-text-secondary transition-colors hover:bg-surface-card hover:text-text-primary"
        >
          <span>更多生理指标</span>
          {showMoreMetrics ? <ChevronUp className="size-4 shrink-0" aria-hidden /> : <ChevronDown className="size-4 shrink-0" aria-hidden />}
        </button>

        {showMoreMetrics ? (
          <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
            <PageCard>
              <WellnessMetricChart metricKey="spo2" field="spo2" data={wellness.data} color="exercise" />
            </PageCard>
            <PageCard>
              <BloodPressureChart data={wellness.data} />
            </PageCard>
            <PageCard>
              <NutritionChart data={wellness.data} />
            </PageCard>
            <PageCard>
              <MenstrualPhaseStrip data={wellness.data} />
            </PageCard>
          </div>
        ) : null}
      </div>
    </div>
  );
}
