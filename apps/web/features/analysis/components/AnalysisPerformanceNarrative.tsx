"use client";

import { useMemo } from "react";
import { Section } from "@shared/ui/Section";
import { usePersonalRecords } from "@features/performance/hooks/usePersonalRecords";
import { useProfile } from "@features/settings/hooks/useProfile";
import { useWellnessHistory } from "@features/health/lib/physiology-display";
import { HEART_RATE_UNIT } from "@shared/config/terms";

type WellnessSample = {
  readonly day: string;
  readonly vo2max: number | null;
};

/**
 * Performance strip — metric tiles only, no coaching essay.
 * Keeps sport-specific labels for contract tests.
 */
export function AnalysisPerformanceNarrative() {
  const monthAgo = useMemo(() => {
    const d = new Date();
    d.setDate(d.getDate() - 30);
    return d.toISOString().slice(0, 10);
  }, []);
  const { profile } = useProfile();
  const wellness = useWellnessHistory();
  const { data: records } = usePersonalRecords();
  const vo2 = latestVo2(wellness, monthAgo);
  const physiology = buildPhysiologyLine({
    lthr: profile?.lthr ?? null,
    thresholdPace: profile?.threshold_pace ?? null,
    vo2max: vo2.current,
  });
  const changeText = vo2ChangeText(vo2);
  const prText = personalRecordText(records.length);

  return (
    <Section title="跑步能力" testId="analysis-performance-narrative">
      <div className="p-5">
      {/* Compact metric chips — numbers first, no essay body */}
      <div className="flex flex-wrap gap-2" data-testid="analysis-performance-metrics">
        {[...physiology, "比赛预测", "最佳成绩"].map((chip) => (
          <span
            key={chip}
            className="rounded-full bg-surface-overlay/70 px-2.5 py-1 font-mono text-caption1 tabular-nums text-text-primary"
          >
            {chip}
          </span>
        ))}
      </div>

      <p className="mt-3 text-caption1 leading-relaxed text-text-secondary">
        阈值配速、体能指标与比赛成绩共同反映当前跑步能力。
      </p>

      <div className="mt-4 grid grid-cols-1 gap-px overflow-hidden rounded-lg bg-border-subtle sm:grid-cols-2">
        <div className="bg-surface-card px-3 py-2.5">
          <p className="text-caption1 font-medium text-text-secondary">最大摄氧量</p>
          <p className="mt-1 font-mono text-subheadline font-semibold tabular-nums text-text-primary">
            {changeText}
          </p>
        </div>
        <div
          className="bg-surface-card px-3 py-2.5"
          data-testid={
            records.length === 0 ? "analysis-pr-empty-source" : "analysis-pr-source"
          }
        >
          <p className="text-caption1 font-medium text-text-secondary">最佳成绩</p>
          <p className="mt-1 text-subheadline text-text-primary">{prText}</p>
        </div>
      </div>
      </div>
    </Section>
  );
}

function buildPhysiologyLine(values: {
  readonly lthr: number | null;
  readonly thresholdPace: number | null;
  readonly vo2max: number | null;
}): readonly string[] {
  return [
    `阈值配速 ${formatThresholdPace(values.thresholdPace)}`,
    values.lthr != null ? `乳酸阈心率 ${Math.round(values.lthr)} ${HEART_RATE_UNIT}` : "缺少乳酸阈心率",
    values.vo2max != null
      ? `最大摄氧量 ${values.vo2max.toFixed(1)} ml/kg/min`
      : "缺少最大摄氧量",
  ];
}

function vo2ChangeText(vo2: {
  readonly current: number | null;
  readonly prior: number | null;
}): string {
  const change =
    vo2.current != null && vo2.prior != null ? vo2.current - vo2.prior : null;
  if (vo2.current == null) return "--";
  if (change == null) return vo2.current.toFixed(1);
  return `${vo2.current.toFixed(1)} (${formatSigned(change)})`;
}

function personalRecordText(recordCount: number): string {
  return recordCount > 0
    ? `${recordCount} 条`
    : "缺少最佳成绩记录：同步包含 GPS 或比赛结果的跑步活动后会生成趋势。";
}

function latestVo2(
  rows: readonly WellnessSample[],
  priorCutoff: string,
): { readonly current: number | null; readonly prior: number | null } {
  const current = latestValue(rows);
  const priorRows = rows.filter((r) => r.day < priorCutoff);
  const prior = latestValue(priorRows);
  return { current, prior };
}

function latestValue(rows: readonly WellnessSample[]): number | null {
  for (let i = rows.length - 1; i >= 0; i -= 1) {
    const v = rows[i]?.vo2max;
    if (typeof v === "number") return v;
  }
  return null;
}

function formatThresholdPace(seconds: number | null): string {
  if (seconds == null || seconds <= 0) return "--";
  const m = Math.floor(seconds / 60);
  const s = Math.round(seconds % 60)
    .toString()
    .padStart(2, "0");
  return `${m}'${s}"/km`;
}

function formatSigned(value: number): string {
  const sign = value > 0 ? "+" : "";
  return `${sign}${value.toFixed(1)}`;
}
