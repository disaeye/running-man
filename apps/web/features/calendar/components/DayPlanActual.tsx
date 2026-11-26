"use client";

import { MetricStrip, type MetricStripItem } from "@shared/ui/MetricStrip";
import { PlanActualDeltaGrid, type PlanActualRowItem } from "@shared/ui/PlanActualDeltaGrid";
import {
  buildPlanActualDeltas,
  othersLine,
  plannedFamily,
  sumRecorded,
  weightedRecorded,
} from "@features/calendar/lib/plan-actual-delta";
import {
  formatDistance,
  formatDuration,
  formatHeartRate,
  formatPace,
  formatPaceFromSeconds,
} from "@shared/lib/format";
import { getSportConfig } from "@shared/config/sport-config";
import type { ActivitySummary } from "@shared/types/activity";
import type { CalendarEventDTO } from "@features/calendar/components/types";

const UNRECORDED = "未记录";

interface DayPlanActualProps {
  readonly event: CalendarEventDTO | undefined;
  readonly activities: readonly ActivitySummary[];
}

/**
 * 同一天的「计划与实际」对照：四列对齐展示指标 / 计划 / 实际 / 偏差 Δ 徽章。
 */
export function DayPlanActual({ event, activities }: DayPlanActualProps) {
  if (!event || activities.length === 0) return null;

  const prescription = event.workout_prescription ?? null;
  const planPace =
    prescription?.pace_min_s_km != null && prescription.pace_max_s_km != null
      ? `${formatPaceFromSeconds(prescription.pace_min_s_km)}–${formatPaceFromSeconds(
          prescription.pace_max_s_km,
        )} /km`
      : null;

  const family = plannedFamily(event);
  const compared = family
    ? activities.filter((activity) => getSportConfig(activity.sport).family === family)
    : activities.filter((activity) => activity.distance_m != null && activity.distance_m > 0);
  const others = activities.filter((activity) => !compared.includes(activity));

  const distanceM = sumRecorded(compared, (activity) => activity.distance_m);
  const durationS = sumRecorded(compared, (activity) => activity.duration_s);
  const avgPace =
    distanceM != null && durationS != null && durationS > 0
      ? `${formatPace(distanceM / durationS)} /km`
      : null;
  const avgHr = weightedRecorded(compared, (activity) => activity.avg_hr);
  const cadence = weightedRecorded(compared, (activity) => activity.avg_cadence);

  const note = othersLine(
    others,
    compared.length,
    event.sport_type ? getSportConfig(event.sport_type).label : null,
  );

  const effectiveRpe =
    compared.find((activity) => activity.rpe != null)?.rpe ??
    event.completed_rpe ??
    null;
  const stripItems: MetricStripItem[] = [
    {
      label: "RPE",
      value: effectiveRpe == null ? UNRECORDED : String(effectiveRpe),
      note: effectiveRpe == null ? "没有记录 RPE" : undefined,
    },
  ];
  const quality = event.session_classification?.quality ?? null;
  const execution = event.session_classification?.execution ?? null;
  const deltas = buildPlanActualDeltas({
    plannedDistanceM: event.predicted_distance_m ?? null,
    actualDistanceM: distanceM,
    plannedDurationMin: prescription?.duration_min ?? null,
    actualDurationS: durationS,
    paceMinS: prescription?.pace_min_s_km ?? null,
    paceMaxS: prescription?.pace_max_s_km ?? null,
  });

  const deltaByKey = new Map(deltas.filter((d) => d.key).map((d) => [d.key!, d]));
  const rows: PlanActualRowItem[] = [
    {
      key: "distance",
      label: "距离",
      planned: event.predicted_distance_m != null && event.predicted_distance_m > 0 ? formatDistance(event.predicted_distance_m) : null,
      actual: distanceM == null ? null : formatDistance(distanceM),
      delta: deltaByKey.get("distance") ?? null,
      missingNote: "活动没有距离数据",
    },
    {
      key: "duration",
      label: "时长",
      planned: prescription ? `${prescription.duration_min} 分钟` : null,
      actual: durationS == null ? null : formatDuration(durationS),
      delta: deltaByKey.get("duration") ?? null,
      missingNote: "活动没有用时数据",
    },
    {
      key: "pace",
      label: "配速",
      planned: planPace,
      actual: avgPace,
      delta: deltaByKey.get("pace") ?? null,
      missingNote: "没有带距离的训练",
    },
    {
      key: "avg_hr",
      label: "平均心率",
      planned: null,
      actual: avgHr == null ? null : formatHeartRate(avgHr),
      missingNote: "活动没有心率数据",
    },
    {
      key: "cadence",
      label: "步频",
      planned: null,
      actual: cadence == null ? null : `${Math.round(cadence)} spm`,
      missingNote: "活动没有步频数据",
    },
  ];

  return (
    <div className="flex flex-col gap-3" data-testid="day-plan-actual">
      <PlanActualDeltaGrid
        rows={rows}
        summaryBadges={deltas}
        footnote={note}
      />

      <MetricStrip items={stripItems} columns={3} testId="day-plan-actual-metrics" />

      {quality ? <SegmentQuality quality={quality} workDistanceM={execution?.work_distance_m ?? null} /> : null}
    </div>
  );
}

function SegmentQuality({
  quality,
  workDistanceM,
}: {
  readonly quality: NonNullable<CalendarEventDTO["session_classification"]>["quality"];
  readonly workDistanceM: number | null;
}) {
  const distanceMatch = quality?.work_distance_match ?? null;
  const durationMatch = quality?.work_duration_match ?? null;
  const items: MetricStripItem[] = [
    {
      label: "课表距离达成",
      value: distanceMatch == null ? UNRECORDED : `${Math.round(distanceMatch * 100)}%`,
      note: distanceMatch == null ? "没有对比数据" : undefined,
    },
    {
      label: "课表时长达成",
      value: durationMatch == null ? UNRECORDED : `${Math.round(durationMatch * 100)}%`,
      note: durationMatch == null ? "没有对比数据" : undefined,
    },
    {
      label: "质量段距离",
      value: workDistanceM == null ? UNRECORDED : formatDistance(workDistanceM),
      note: workDistanceM == null ? "未记录" : undefined,
    },
  ];
  return <MetricStrip items={items} columns={3} testId="day-plan-actual-quality" />;
}
