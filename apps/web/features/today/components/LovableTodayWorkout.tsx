"use client";

import Link from "next/link";
import { AlertTriangle, Info } from "lucide-react";
import { InsetBlock } from "@shared/ui/InsetBlock";
import { Stat } from "@shared/ui/StatCell";
import { Button } from "@shared/ui/button";
import { Tag } from "@shared/ui/Badge";
import { VerdictCard } from "@shared/ui/VerdictCard";
import { formatDuration, formatPaceFromSeconds } from "@shared/lib/format";
import { workoutTypeLabel } from "@features/today/lib/session-label";
import { useReadingSequence } from "@features/today/lib/use-reading-sequence";
import { recommendationReason } from "@features/today/lib/recommendation-reason";
import type { CalendarEventDTO } from "@features/calendar/components/types";
import type { CoachRecommendation } from "@features/today/hooks/useCoachContext";
import type { ActivitySummary } from "@shared/types/activity";

const RISK_LABELS: Record<string, string> = {
  readiness_low: "恢复就绪度偏低，建议控制强度或增加休息",
  weekly_tss_near_limit: "本周训练负荷已接近上限，注意控制总量",
  insufficient_rest_days: "近期连续训练天数较多，建议安排恢复日",
  acwr_high: "近期负荷增幅偏快（ACWR 偏高），留意疲劳累积",
  no_plan_tomorrow: "明日尚未安排课表，可在训练日历提前规划",
};

const CAUTION_RISKS = new Set([
  "readiness_low",
  "weekly_tss_near_limit",
  "insufficient_rest_days",
  "acwr_high",
]);

interface MetricItem {
  readonly label: string;
  readonly value: string | number;
  readonly unit?: string;
  readonly tone?: string;
  readonly wide?: boolean;
}

function formatRisk(risk: string): string {
  return RISK_LABELS[risk] ?? risk;
}

function CoachReasonBlock({ label, decision, hasPrescription = false }: { label: string; decision: CoachRecommendation; hasPrescription?: boolean }) {
  const isCaution =
    decision.action === "rest" ||
    decision.risks.some((risk) => CAUTION_RISKS.has(risk));
  return (
    <InsetBlock tone={isCaution ? "warn" : "default"}>
      <div className={`flex items-center gap-2 text-subheadline font-semibold ${isCaution ? "text-warn" : "text-accent-strong"}`}>
        {isCaution ? <AlertTriangle className="h-4 w-4 shrink-0" /> : <Info className="h-4 w-4 shrink-0" />}
        <span>{label}</span>
      </div>
      {decision.reason ? (
        <p className="mt-1 text-subheadline leading-relaxed text-text-secondary">{recommendationReason(decision, hasPrescription)}</p>
      ) : null}
      {decision.risks.length > 0 ? (
        <ul className="mt-1.5 space-y-0.5 text-caption1 text-warn">
          {decision.risks.map((risk) => (
            <li key={risk} className="flex items-start gap-1.5">
              <span aria-hidden className="mt-1.5 size-1 shrink-0 rounded-full bg-warn" />
              <span>{formatRisk(risk)}</span>
            </li>
          ))}
        </ul>
      ) : null}
    </InsetBlock>
  );
}

function MetricRow({ items }: { readonly items: readonly MetricItem[] }) {
  const gridClass = items.length <= 2
    ? "grid-cols-2"
    : items.length === 3
      ? "grid-cols-2 sm:flex sm:flex-wrap sm:items-end sm:gap-x-8 sm:gap-y-3"
      : "grid-cols-2 sm:grid-cols-4";
  return (
    <div className={`grid gap-3 ${gridClass}`}>
      {items.map((item, idx) => (
        <div key={item.label} className={item.wide && items.length === 3 ? "col-span-2 sm:col-span-1" : undefined}>
          <Stat
            label={item.label}
            value={item.value}
            unit={item.unit}
            tone={item.tone}
            focal={idx === 0}
          />
        </div>
      ))}
    </div>
  );
}

/**
 * 今日安排（结论先行）：
 *
 * 今天已经有完成的训练时，卡片回答「今天练得怎么样」；没有完成记录时回答「今天该练什么」。
 * 仅展示已测得或已排定的有效读数，空字段不占位；多段课表处方一律默认收起按需展开。
 */
export function LovableTodayWorkout({ decision, prescription, linkedActivityId, completed, otherCompletedCount = 0, distanceM = null, goal = null, testId }: {
  decision: CoachRecommendation | null;
  prescription: CalendarEventDTO["workout_prescription"] | null;
  linkedActivityId: string | null;
  completed: ActivitySummary | null;
  otherCompletedCount?: number;
  distanceM?: number | null;
  goal?: { name: string; targetDate: string | null } | null;
  testId?: string;
}) {

  const hasCaution = Boolean(
    decision &&
      (decision.action === "rest" || decision.risks.some((risk) => CAUTION_RISKS.has(risk))),
  );
  const readingKey = [
    completed?.activity_id ?? "pending",
    prescription?.type ?? decision?.workout_type ?? "none",
    distanceM,
    prescription?.duration_min ?? decision?.duration_min,
    decision?.target_tss,
    decision?.reason,
  ].join("|");
  const reading = useReadingSequence(readingKey);

  if (completed) {
    const isStrength = completed.sport === "WeightTraining" || completed.sport === "Workout";
    const paceSec = !isStrength && completed.avg_speed && completed.avg_speed > 0 ? 1000 / completed.avg_speed : null;
    const completedItems: MetricItem[] = isStrength
      ? [
          ...(completed.duration_s != null ? [{ label: "时长", value: formatDuration(completed.duration_s) }] : []),
          ...(completed.avg_hr != null ? [{ label: "平均心率", value: Math.round(completed.avg_hr), unit: "bpm" }] : []),
          ...(completed.tss != null ? [{ label: "TSS", value: Math.round(completed.tss) }] : []),
          ...(completed.calories != null ? [{ label: "卡路里", value: Math.round(completed.calories), unit: "kcal" }] : []),
        ]
      : [
          ...(completed.distance_m != null && completed.distance_m > 0
            ? [{ label: "距离", value: (completed.distance_m / 1000).toFixed(2), unit: "km" }]
            : []),
          ...(completed.duration_s != null ? [{ label: "时长", value: formatDuration(completed.duration_s) }] : []),
          ...(paceSec ? [{ label: "平均配速", value: formatPaceFromSeconds(Math.round(paceSec)), unit: "/km" }] : []),
          ...(completed.tss != null
            ? [{ label: "TSS", value: Math.round(completed.tss) }]
            : completed.avg_hr != null
              ? [{ label: "平均心率", value: Math.round(completed.avg_hr), unit: "bpm" }]
              : []),
        ];

    return (
      <VerdictCard
        testId={testId}
        className={reading.updated ? "reading-updated" : ""}
        accent="success"
        eyebrow="今日已完成"
        title={completed.name?.trim() || (isStrength ? "力量训练" : "跑步训练")}
        metrics={completedItems.length > 0 ? <MetricRow items={completedItems.slice(0, 4)} /> : undefined}
        reasoning={decision && (decision.reason || decision.risks.length > 0) ? <CoachReasonBlock label="教练提示" decision={decision} /> : null}
        footer={
          <div className="flex items-center justify-end gap-2">
            <Button asChild size="sm">
              <Link href={`/activities/${completed.activity_id}`}>查看这次训练</Link>
            </Button>
          </div>
        }
      />
    );
  }

  const isRest = decision?.action === "rest";
  const prescriptionPace = prescription?.pace_min_s_km != null && prescription?.pace_max_s_km != null
    ? { min: prescription.pace_min_s_km, max: prescription.pace_max_s_km }
    : null;
  const resolvedType = prescription?.type || decision?.workout_type || null;
  const title = isRest ? "今天休息" : resolvedType ? workoutTypeLabel(resolvedType) : "今天没有安排课表";
  const duration = prescription?.duration_min ?? decision?.duration_min ?? null;
  const tss = decision?.target_tss ?? null;

  const plannedItems: MetricItem[] = isRest
    ? []
    : [
        ...(distanceM != null ? [{ label: "距离", value: (distanceM / 1000).toFixed(1), unit: "km" }] : []),
        ...(duration != null ? [{ label: "时长", value: Math.round(duration), unit: "min" }] : []),
        ...(prescriptionPace
          ? [{
              label: "目标配速",
              value: `${formatPaceFromSeconds(prescriptionPace.min)}–${formatPaceFromSeconds(prescriptionPace.max)}`,
              unit: "/km",
              tone: "text-accent-strong",
              wide: true,
            }]
          : []),
        ...(!prescriptionPace || distanceM == null || duration == null
          ? (tss != null ? [{ label: "预计 TSS", value: Math.round(tss) }] : [])
          : []),
      ];

  return (
    <VerdictCard
      testId={testId}
      className={reading.playing ? "reading-active" : reading.updated ? "reading-updated" : ""}
      accent={hasCaution ? "warn" : "accent"}
      eyebrow="今日安排"
      badge={goal ? <Tag tone="primary">{goal.name}</Tag> : undefined}
      title={title}
      metrics={
        plannedItems.length > 0 ? (
          <MetricRow items={plannedItems} />
        ) : (
          <p className="text-subheadline text-text-secondary">
            {isRest
              ? "今天不安排训练负荷，优先保证睡眠、补水与主动恢复。"
              : "还没有生成或编排今日课表，你可以前往训练日历手动安排。"}
          </p>
        )
      }
      banner={
        reading.updated || otherCompletedCount > 0 ? (
          <div className="space-y-2">
            {reading.updated ? <p role="status" className="text-caption1 text-success">建议已更新</p> : null}
            {otherCompletedCount > 0 ? (
              <p className="border-l-2 border-info px-3 py-2 text-caption1 text-text-secondary">
                今日已记录 {otherCompletedCount} 项其他训练，当前仍有待完成计划课。
              </p>
            ) : null}
          </div>
        ) : null
      }
      reasoning={decision && (decision.reason || decision.risks.length > 0) ? (
        <CoachReasonBlock label="训练建议" decision={decision} hasPrescription={prescriptionPace != null} />
      ) : null}
      footer={
        <div className="flex items-center justify-end gap-2">
          <Button asChild size="sm">
            <Link href={linkedActivityId ? `/activities/${linkedActivityId}` : "/calendar"}>
              {linkedActivityId ? "查看活动" : "查看课表"}
            </Link>
          </Button>
        </div>
      }
    />
  );
}
