"use client";

import { useMemo } from "react";
import { PeriodReading } from "./PeriodReading";
import { buildPeriodPillars } from "../lib/period-pillars";
import { usePmcData } from "@features/pmc/hooks/usePmcData";
import { useIntensityDistribution } from "@features/performance/hooks/useIntensityDistribution";
import { useThresholdHistory } from "@features/settings/hooks/useThresholdHistory";
import { useCurrentReadings } from "@features/health/lib/physiology-display";
import { useActivities } from "@features/activity/hooks/useActivities";
import { useWellness } from "@features/health/hooks/useWellness";
import { useWeeklyProgress } from "@features/today/hooks/useWeeklyProgress";
import type { AnalysisTabId } from "@shared/config/canonical-routes";

/**
 * 「本期解读」容器：按当前激活的 tab 组合真实区间计算数字，
 * 生成带具体数字和对比口径的支柱结论。
 */
export function PeriodReadingPanel({
  tab,
  from,
  to,
}: {
  tab: AnalysisTabId;
  from: string;
  to: string;
}) {
  const pmc = usePmcData(from, to);
  const intensity = useIntensityDistribution(tab === "load" ? from : "", tab === "load" ? to : "");
  const thresholds = useThresholdHistory();
  const vo2max = useCurrentReadings().vo2max;
  const activities = useActivities(tab === "performance" ? from : "", tab === "performance" ? to : "");
  const wellness = useWellness(tab === "body" ? from : "", tab === "body" ? to : "");
  const weekly = useWeeklyProgress(tab === "body" ? from : "", tab === "body" ? to : "");

  const pillars = useMemo(
    () =>
      buildPeriodPillars({
        tab,
        from,
        to,
        pmc: pmc.data,
        intensity: intensity.data,
        thresholds: thresholds.entries,
        vo2max,
        activities: activities.data,
        wellness: wellness.data,
        weeks: weekly.weeks,
      }),
    [
      tab,
      from,
      to,
      pmc.data,
      intensity.data,
      thresholds.entries,
      vo2max,
      activities.data,
      wellness.data,
      weekly.weeks,
    ],
  );

  return (
    <PeriodReading
      loading={pmc.loading}
      error={pmc.error}
      points={pmc.data}
      pillars={pillars}
      rangeLabel={`${from} 至 ${to}`}
    />
  );
}
