"use client";

import { InsetBlock } from "@shared/ui/InsetBlock";
import { MetricStrip, type MetricStripItem } from "@shared/ui/MetricStrip";
import {
  formatDistance,
  formatDuration,
  formatHeartRate,
  formatPace,
  formatPaceFromSeconds,
} from "@shared/lib/format";
import { getSportConfig, type SportFamily } from "@shared/config/sport-config";
import type { ActivitySummary } from "@shared/types/activity";
import type { CalendarEventDTO } from "@features/calendar/components/types";

/** 缺值文案，和日历里其它块同一个词。 */
const UNRECORDED = "未记录";

interface DayPlanActualProps {
  /** 当天的计划事件；`CalendarDaySheet` 用它的 `editingEvent`。 */
  readonly event: CalendarEventDTO | undefined;
  /** 当天已记录的活动，来源与日历的 `activityMap` 一致。 */
  readonly activities: readonly ActivitySummary[];
}

/** 同类训练里某一项的合计；一项都没有值时返回 null，不拿 0 顶替缺失。 */
function sumRecorded(
  activities: readonly ActivitySummary[],
  read: (activity: ActivitySummary) => number | null,
): number | null {
  let total = 0;
  let count = 0;
  for (const activity of activities) {
    const value = read(activity);
    if (value == null) continue;
    total += value;
    count += 1;
  }
  return count === 0 ? null : total;
}

/**
 * 活动摘要里只有整段均值，同类训练不止一次时按时长加权才是这一类的均值。
 * 缺这一项的场次不参与加权——它不是 0，只是没测。
 */
function weightedRecorded(
  activities: readonly ActivitySummary[],
  read: (activity: ActivitySummary) => number | null,
): number | null {
  let weighted = 0;
  let weight = 0;
  for (const activity of activities) {
    const value = read(activity);
    const seconds = activity.duration_s;
    if (value == null || seconds == null || seconds <= 0) continue;
    weighted += value * seconds;
    weight += seconds;
  }
  return weight === 0 ? null : weighted / weight;
}

/**
 * 被计划的那一类训练。
 *
 * 课表里的配速区间和时长描述的是一类训练（跑步课表就是跑步），右列也只拿
 * 这一类来比；别的运动混进来，两个数字就不再指同一件事。
 *
 * 没有 `sport_type`，或者注册表认不出这个值（family 落到 `unknown`）时没有
 * 类别可对齐，退回「带距离的训练」——配速、步频这些右列的主要格子本来就只
 * 对有位移的场次成立。
 */
function plannedFamily(event: CalendarEventDTO): SportFamily | null {
  if (!event.sport_type) return null;
  const family = getSportConfig(event.sport_type).family;
  return family === "unknown" ? null : family;
}

/**
 * 不进对比的那一行：当天还做了哪些别的运动，几次、加起来多久。
 *
 * 只报次数和别的运动自己的时长，不报被比较的那一类里的任何数字。
 */
function othersLine(
  others: readonly ActivitySummary[],
  comparedCount: number,
  plannedLabel: string | null,
): string | null {
  if (others.length === 0) return null;

  const labels = new Map<string, number>();
  for (const activity of others) {
    const label = getSportConfig(activity.sport).label;
    labels.set(label, (labels.get(label) ?? 0) + 1);
  }
  const counts = [...labels]
    .map(([label, count]) => `${count} 次${label}`)
    .join("、");
  const totalS = sumRecorded(others, (activity) => activity.duration_s);
  const duration = totalS == null ? null : formatDuration(totalS);
  // 只有一种别的运动时，时长就是它的；不止一种时写「合计」，否则读者会把
  // 那个数配给最后一个运动名。
  const amount =
    duration == null ? "" : labels.size > 1 ? `，合计 ${duration}` : `，${duration}`;

  return comparedCount === 0
    ? `当天没有${plannedLabel ?? "带距离的训练"}，只有 ${counts}${amount}`
    : `当天另有 ${counts}${amount}`;
}

/**
 * 列内的一格：12px 标签加 13px 等宽数字；缺值仍占一行，不缩成 0，
 * 并在下面一句说清缺的是哪个字段。
 */
function PlanActualRow({
  label,
  value,
  note,
}: {
  readonly label: string;
  readonly value: string | null;
  readonly note: string;
}) {
  return (
    <div className="min-w-0">
      <p className="truncate text-caption1 text-text-muted">{label}</p>
      <p
        className={`mt-0.5 truncate font-mono text-subheadline tabular-nums ${
          value == null ? "text-text-muted" : "text-text-primary"
        }`}
      >
        {value ?? UNRECORDED}
      </p>
      {value == null ? (
        <p className="mt-0.5 text-caption1 text-text-muted">{note}</p>
      ) : null}
    </div>
  );
}

/**
 * 同一天的「计划与实际」对照：左列课表，右列记录。
 *
 * 只在当天既有计划事件、又有已记录活动时出现——只有一半事实的时候，
 * 上半部分的 `PlanPacePrescription` 和 `DayActivitySummary` 已经各说过一遍，
 * 这里再画一个半空的块只是噪音。
 *
 * 两列讲同一类训练：右列只统计与被计划事件同 family 的活动，别的运动挪到
 * `MetricStrip` 上面一行文字里单独交代，不进任何数字。计划写的是跑步课表，
 * 右列却报当天总量（跑步加力量），「计划 40 分钟」对着「实际 1h30」比的
 * 就不是同一件事了。
 *
 * 有氧解耦不在这个块里算：它要从活动流（成对的功率或心率）现算，活动摘要
 * 里没有这个字段，所以那一格写「未记录」并说明缺的是解耦本身。
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
    ? activities.filter(
        (activity) => getSportConfig(activity.sport).family === family,
      )
    : activities.filter(
        (activity) => activity.distance_m != null && activity.distance_m > 0,
      );
  const others = activities.filter((activity) => !compared.includes(activity));

  const distanceM = sumRecorded(compared, (activity) => activity.distance_m);
  const durationS = sumRecorded(compared, (activity) => activity.duration_s);
  const avgPace =
    distanceM != null && durationS != null && durationS > 0
      ? `${formatPace(distanceM / durationS)} /km`
      : null;
  const avgHr = weightedRecorded(compared, (activity) => activity.avg_hr);
  const cadence = weightedRecorded(compared, (activity) => activity.avg_cadence);
  const tss = sumRecorded(compared, (activity) => activity.tss);

  const note = othersLine(
    others,
    compared.length,
    event.sport_type ? getSportConfig(event.sport_type).label : null,
  );

  const stripItems: MetricStripItem[] = [
    {
      label: "TSS",
      value: tss == null ? UNRECORDED : String(Math.round(tss)),
      note: tss == null ? "缺功率或心率数据" : undefined,
    },
    {
      label: "有氧解耦",
      value: UNRECORDED,
      note: "活动摘要不含解耦",
    },
    {
      label: "RPE",
      value: event.completed_rpe == null ? UNRECORDED : String(event.completed_rpe),
      note: event.completed_rpe == null ? "没有记录 RPE" : undefined,
    },
  ];

  return (
    <div className="flex flex-col gap-3" data-testid="day-plan-actual">
      <InsetBlock>
        <div className="grid min-w-0 grid-cols-2 gap-x-4 gap-y-3">
          <div className="min-w-0">
            <p className="text-caption1 font-semibold text-text-secondary">计划课表</p>
            <div className="mt-2 flex flex-col gap-2">
              {/* 两个 DTO 都没有计划距离：处方只有时长、配速和分段，事件只有
                  完成后的 `completed_distance_m`。这一格不用时长乘配速倒推。 */}
              <PlanActualRow
                label="目标距离"
                value={null}
                note="课表和事件都没有距离"
              />
              <PlanActualRow
                label="配速区间"
                value={planPace}
                note="课表没有配速区间"
              />
              <PlanActualRow
                label="预计 TSS"
                value={
                  event.predicted_tss == null
                    ? null
                    : String(Math.round(event.predicted_tss))
                }
                note="事件没有预计 TSS"
              />
              <PlanActualRow
                label="时长"
                value={prescription ? `${prescription.duration_min} 分钟` : null}
                note="课表没有时长"
              />
            </div>
          </div>

          <div className="min-w-0">
            <p className="text-caption1 font-semibold text-text-secondary">实际完成</p>
            <div className="mt-2 flex flex-col gap-2">
              <PlanActualRow
                label="距离"
                value={distanceM == null ? null : formatDistance(distanceM)}
                note="活动没有距离数据"
              />
              <PlanActualRow
                label="用时"
                value={durationS == null ? null : formatDuration(durationS)}
                note="活动没有用时数据"
              />
              <PlanActualRow
                label="平均配速"
                value={avgPace}
                note="没有带距离的训练"
              />
              <PlanActualRow
                label="平均心率"
                value={avgHr == null ? null : formatHeartRate(avgHr)}
                note="活动没有心率数据"
              />
              <PlanActualRow
                label="步频"
                value={cadence == null ? null : `${Math.round(cadence)} spm`}
                note="活动没有步频数据"
              />
            </div>
          </div>
        </div>

        {note ? (
          <p
            className="mt-3 text-caption1 text-text-muted"
            data-testid="day-plan-actual-others"
          >
            {note}
          </p>
        ) : null}
      </InsetBlock>

      <MetricStrip items={stripItems} columns={3} testId="day-plan-actual-metrics" />
    </div>
  );
}
