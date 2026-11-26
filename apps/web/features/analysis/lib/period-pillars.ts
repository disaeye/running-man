import { getSportConfig } from "@shared/config/sport-config";
import { formatPace } from "@features/today/hooks/useAbility";
import { summarizeIntensity } from "./intensity-summary";
import type { AnalysisTabId } from "@shared/config/canonical-routes";
import type { PmcPoint } from "@features/pmc/hooks/usePmcData";
import type { IntensityPoint } from "@features/performance/components/PerformanceIntensity";
import type { ThresholdHistoryEntry } from "@features/settings/hooks/useThresholdHistory";
import type { ActivitySummary } from "@shared/types/activity";
import type { WellnessPoint } from "@features/health/hooks/useWellness";
import type { WeekProgress } from "@features/today/hooks/useWeeklyProgress";

export interface ReadingPillar {
  readonly title: string;
  readonly verdict: string;
}

export function buildPeriodPillars(params: {
  readonly tab: AnalysisTabId;
  readonly from: string;
  readonly to: string;
  readonly pmc: readonly PmcPoint[];
  readonly intensity: readonly IntensityPoint[];
  readonly thresholds: readonly ThresholdHistoryEntry[];
  readonly vo2max: { readonly value: number; readonly day: string } | null;
  readonly activities: readonly ActivitySummary[];
  readonly wellness: readonly WellnessPoint[];
  readonly weeks: readonly WeekProgress[];
}): ReadingPillar[] {
  const { tab, from, to, pmc, intensity, thresholds, vo2max, activities, wellness, weeks } = params;

  if (tab === "load") {
    const pillars: ReadingPillar[] = [];
    const summary = summarizeIntensity(intensity);
    const { lowPct, highPct } = summary;
    if (summary.hasData) {
      pillars.push({
        title: "强度结构",
        verdict: `Z1+Z2 低强度占比 ${lowPct}%（${lowPct >= 78 ? "符合" : "低于"} 80/20 耐力结构），Z4+Z5 高强度占比 ${highPct}%。`,
      });
    } else {
      pillars.push({
        title: "强度结构",
        verdict: "所选周期暂无包含心率流量的活动，无法计算五区强度结构。",
      });
    }
    const latestAcwr = pmc.at(-1)?.acwr;
    if (latestAcwr != null) {
      const assessment =
        latestAcwr > 1.3
          ? "负荷增速偏快，留意恢复安排"
          : latestAcwr < 0.8
            ? "近期负荷处于回落期"
            : "处于 0.80–1.30 平稳增长走廊";
      pillars.push({
        title: "负荷变化率",
        verdict: `最新 ACWR ${latestAcwr.toFixed(2)}，${assessment}。`,
      });
    }
    return pillars;
  }

  if (tab === "performance") {
    const pillars: ReadingPillar[] = [];
    const paces = thresholds.filter((entry) => {
      if (entry.threshold_pace == null) return false;
      const day = entry.effective_from.slice(0, 10);
      return (!from || day >= from) && (!to || day <= to);
    });
    if (paces.length >= 2) {
      const firstPace = paces[0]!.threshold_pace!;
      const lastPace = paces[paces.length - 1]!.threshold_pace!;
      const diffS = Math.round(firstPace - lastPace);
      const trend = diffS > 0 ? `提升 ${diffS} 秒/km` : diffS < 0 ? `放缓 ${Math.abs(diffS)} 秒/km` : "保持稳定";
      pillars.push({
        title: "阈值配速",
        verdict: `阈值配速从 ${formatPace(firstPace)}/km 变化至 ${formatPace(lastPace)}/km（${trend}）。`,
      });
    } else if (paces.length === 1) {
      pillars.push({
        title: "阈值配速",
        verdict: `周期内最新阈值配速参考为 ${formatPace(paces[0]!.threshold_pace)}/km。`,
      });
    }

    const efValues = activities
      .filter((a) => getSportConfig(a.sport).isRun && a.avg_speed != null && a.avg_speed > 0 && a.avg_hr != null && a.avg_hr > 0)
      .map((a) => (a.avg_speed! * 60) / a.avg_hr!)
      .reverse();
    if (efValues.length >= 2) {
      const avgEf = efValues.reduce((s, v) => s + v, 0) / efValues.length;
      const deltaEf = efValues[efValues.length - 1]! - efValues[0]!;
      pillars.push({
        title: "有氧效率 EF",
        verdict: `共 ${efValues.length} 次有效跑步，EF 均值 ${avgEf.toFixed(2)} m/beat（起止变化 ${deltaEf >= 0 ? "+" : ""}${deltaEf.toFixed(2)}）。`,
      });
    }
    if (vo2max != null) {
      pillars.push({
        title: "最大摄氧量",
        verdict: `最新设备记录 VO2max ${vo2max.value.toFixed(1)} ml/kg/min（${vo2max.day}）。`,
      });
    }
    if (pillars.length === 0) {
      pillars.push({
        title: "能力趋势",
        verdict: "所选周期暂无足够阈值变化或带心率配速样本，同步更多跑步活动后将在此总结。",
      });
    }
    return pillars;
  }

  const pillars: ReadingPillar[] = [];
  const weights = wellness.filter((w) => w.weight != null).map((w) => w.weight!);
  if (weights.length >= 2) {
    const delta = weights[weights.length - 1]! - weights[0]!;
    pillars.push({
      title: "体重趋势",
      verdict: `体重从 ${weights[0]!.toFixed(1)} kg 变化至 ${weights[weights.length - 1]!.toFixed(1)} kg（${delta >= 0 ? "+" : ""}${delta.toFixed(1)} kg）。`,
    });
  } else if (weights.length === 1) {
    pillars.push({
      title: "体重记录",
      verdict: `最新体重记录为 ${weights[0]!.toFixed(1)} kg。`,
    });
  }
  const sleeps = wellness.filter((w) => w.sleep_secs != null && w.sleep_secs > 0).map((w) => w.sleep_secs! / 3600);
  if (sleeps.length > 0) {
    const avgSleep = sleeps.reduce((s, v) => s + v, 0) / sleeps.length;
    pillars.push({
      title: "睡眠恢复",
      verdict: `共记录 ${sleeps.length} 天睡眠，平均每晚 ${avgSleep.toFixed(1)} 小时。`,
    });
  }
  if (weeks.length > 0) {
    const avgKm = weeks.reduce((s, w) => s + w.actual_distance_m / 1000, 0) / weeks.length;
    pillars.push({
      title: "周跑量节奏",
      verdict: `覆盖 ${weeks.length} 个训练周，周均跑量 ${avgKm.toFixed(1)} km。`,
    });
  }
  if (pillars.length === 0) {
    pillars.push({
      title: "身体与生活",
      verdict: "所选周期内暂无体重、睡眠或周跑量记录。",
    });
  }
  return pillars;
}
