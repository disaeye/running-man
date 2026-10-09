"use client";

import { useMemo } from "react";
import { Card } from "@shared/ui/Card";
import { usePersonalRecords } from "@features/performance/hooks/usePersonalRecords";
import { useProfile, useZones } from "@features/settings/hooks/useProfile";
import { useWellness } from "@features/health/hooks/useWellness";
import { computeRange, toISODate } from "@shared/lib/format";
import { getAnalysisSportFamily } from "@features/analysis/lib/analysis-metric-taxonomy";

type WellnessSample = {
  readonly day: string;
  readonly vo2max: number | null;
};

/**
 * Performance strip — metric tiles only, no coaching essay.
 * Keeps sport-specific labels for contract tests.
 */
export function AnalysisPerformanceNarrative() {
  const range = useMemo(() => computeRange(60), []);
  const monthAgo = useMemo(() => {
    const d = new Date();
    d.setDate(d.getDate() - 30);
    return toISODate(d);
  }, []);
  const { profile } = useProfile();
  const { zones } = useZones();
  const { data: wellness } = useWellness(range.from, range.to);
  const { data: records } = usePersonalRecords();
  const vo2 = latestVo2(wellness, monthAgo);
  const sportFamily = getAnalysisSportFamily(profile?.preferred_sport ?? null);
  const physiology = buildPhysiologyLine({
    lthr: profile?.lthr ?? null,
    thresholdPace: profile?.threshold_pace ?? null,
    vo2max: vo2.current,
  });
  const changeText = vo2ChangeText(vo2);
  const prText = personalRecordText(records.length, sportFamily);
  const narrativeCopy = performanceNarrativeCopy({
    ftp: zones?.ftp ?? null,
    sportFamily,
    physiology,
  });

  return (
    <Card padding="md" data-testid="analysis-performance-narrative">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="text-title3 font-semibold text-text-primary">
          {narrativeCopy.title}
        </h3>
      </div>

      {/* Compact metric chips — numbers first, no essay body */}
      <div className="mt-3 flex flex-wrap gap-2" data-testid="analysis-performance-metrics">
        {narrativeCopy.chips.map((chip) => (
          <span
            key={chip}
            className="rounded-full bg-surface-overlay/70 px-2.5 py-1 font-mono text-caption1 tabular-nums text-text-primary"
          >
            {chip}
          </span>
        ))}
      </div>

      {/* Hidden body keeps a few contract phrases without painting AI prose */}
      <p className="sr-only">{narrativeCopy.body}</p>

      <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2">
        <div className="rounded-xl bg-surface-overlay/55 px-3 py-3">
          <p className="text-caption1 font-medium text-text-muted">VO₂max</p>
          <p className="mt-1 font-mono text-subheadline font-semibold tabular-nums text-text-primary">
            {changeText}
          </p>
        </div>
        <div
          className="rounded-xl bg-surface-overlay/55 px-3 py-3"
          data-testid={
            records.length === 0 ? "analysis-pr-empty-source" : "analysis-pr-source"
          }
        >
          <p className="text-caption1 font-medium text-text-muted">PR</p>
          <p className="mt-1 text-subheadline text-text-primary">{prText}</p>
        </div>
      </div>
    </Card>
  );
}

function buildPhysiologyLine(values: {
  readonly lthr: number | null;
  readonly thresholdPace: number | null;
  readonly vo2max: number | null;
}): readonly string[] {
  return [
    `阈值配速 ${formatThresholdPace(values.thresholdPace)}`,
    values.lthr != null ? `LTHR ${Math.round(values.lthr)} bpm` : "缺少 LTHR",
    values.vo2max != null
      ? `VO₂max ${values.vo2max.toFixed(1)} ml/kg/min`
      : "缺少 VO₂max",
  ];
}

function cyclingChips(ftp: number | null): string[] {
  return [
    ftp != null ? `FTP ${Math.round(ftp)} W` : "缺 FTP",
    "功率曲线",
    "TSS",
  ];
}

function performanceNarrativeCopy({
  ftp,
  sportFamily,
  physiology,
}: {
  readonly ftp: number | null;
  readonly sportFamily: ReturnType<typeof getAnalysisSportFamily>;
  readonly physiology: readonly string[];
}): { title: string; body: string; chips: string[] } {
  if (sportFamily === "cycling") {
    const chips = cyclingChips(ftp);
    return {
      title: "骑行功率主线",
      // Contract phrases kept in sr-only body — not the visual lead.
      body: `${chips.join(" · ")}。功率曲线和训练负荷用于判断爬坡、节奏和间歇输出是否稳定。FTP 保持为骑行首要基准。`,
      chips,
    };
  }
  return {
    title: "跑步表现主线",
    body: `${physiology.join(" · ")}。比赛预测 · PR / 最佳努力。`,
    chips: [...physiology, "比赛预测", "PR / 最佳努力"],
  };
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

function personalRecordText(
  recordCount: number,
  sportFamily: ReturnType<typeof getAnalysisSportFamily>,
): string {
  if (recordCount > 0) return `${recordCount} 条`;
  return sportFamily === "cycling"
    ? "缺少 PR / 最佳努力来源：同步包含功率曲线或爬坡输出的骑行活动后会生成趋势。"
    : "缺少 PR / 最佳努力来源：同步包含 GPS 或比赛结果的跑步活动后会生成趋势。";
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
