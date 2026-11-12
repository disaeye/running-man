"use client";

import Link from "next/link";
import { AlertTriangle, CheckCircle2 } from "lucide-react";
import { PageCard, Stat } from "@shared/ui/Lovable";
import { formatDuration, formatPaceFromSeconds } from "@shared/lib/format";
import { workoutTypeLabel, segmentLabel } from "@features/today/lib/session-label";
import type {
  CalendarEventDTO,
  SessionSegmentDTO,
} from "@features/calendar/components/types";
import type { CoachRecommendation } from "@features/today/hooks/useCoachContext";
import type { ActivitySummary } from "@shared/types/activity";

/**
 * 今日安排。
 *
 * 今天已经有完成的训练时，卡片回答「今天练得怎么样」：距离、时长、
 * 配速、TSS 直接取自那条活动；没有完成记录时才回答「今天该练什么」。
 */
export function LovableTodayWorkout({ decision, prescription, linkedActivityId, completed, distanceM = null, testId }: {
  decision: CoachRecommendation | null;
  prescription: CalendarEventDTO["workout_prescription"] | null;
  linkedActivityId: string | null;
  /** 今天已完成的训练（按运动员本地日匹配） */
  completed: ActivitySummary | null;
  distanceM?: number | null;
  testId?: string;
}) {
  const segments: readonly SessionSegmentDTO[] = prescription?.segments ?? [];
  if (completed) {
    const isStrength = completed.sport === "WeightTraining" || completed.sport === "Workout";
    const paceSec = !isStrength && completed.avg_speed && completed.avg_speed > 0 ? 1000 / completed.avg_speed : null;
    const eyebrowKind = isStrength ? "力量训练" : workoutTypeLabel(prescription?.type ?? "run");
    return <PageCard hero className="relative">
      <div data-testid={testId}>
        <div className="eyebrow mb-1">今日已完成 · {eyebrowKind}</div>
        <h2 className="text-title2 font-bold">{completed.name?.trim() || (isStrength ? "力量训练" : "跑步训练")}</h2>
        {isStrength ? (
          <div className="mt-3 grid grid-cols-4 gap-3">
            <Stat label="时长" value={formatDuration(completed.duration_s ?? 0)} />
            <Stat label="平均心率" value={completed.avg_hr != null ? Math.round(completed.avg_hr) : "未记录"} unit={completed.avg_hr != null ? "bpm" : undefined} />
            <Stat label="TSS" value={completed.tss != null ? Math.round(completed.tss) : "未记录"} />
            <Stat label="卡路里" value={completed.calories != null ? Math.round(completed.calories) : "未记录"} unit={completed.calories != null ? "kcal" : undefined} />
          </div>
        ) : (
          <div className="mt-3 grid grid-cols-4 gap-3">
            <Stat label="距离" value={completed.distance_m != null ? (completed.distance_m / 1000).toFixed(2) : "未记录"} unit={completed.distance_m != null ? "km" : undefined} />
            <Stat label="时长" value={formatDuration(completed.duration_s ?? 0)} />
            <Stat label="平均配速" value={paceSec ? formatPaceFromSeconds(Math.round(paceSec)) : "未记录"} unit={paceSec ? "/km" : undefined} />
            <Stat label="TSS" value={completed.tss != null ? Math.round(completed.tss) : "未记录"} />
          </div>
        )}
        <div className="mt-3 flex items-center gap-2 rounded-xl bg-fitness/10 p-3 text-sm text-fitness">
          <CheckCircle2 className="h-4 w-4 shrink-0" />
          <span>今天已经练过了；剩下的时间是恢复。</span>
        </div>
        {decision ? <div className="mt-3 rounded-xl border border-warn/30 bg-warn/10 p-3"><div className="flex items-center gap-2 font-semibold text-warn"><AlertTriangle className="h-4 w-4" />教练提示</div><p className="mt-1 text-sm">{decision.reason}</p></div> : null}
        <div className="mt-3 flex items-center justify-between gap-2 text-xs text-muted-foreground"><span>平均心率 {completed.avg_hr != null ? `${completed.avg_hr} bpm` : "未记录"}</span><Link href={`/activities/${completed.activity_id}`} className="text-accent-strong">查看这次训练</Link></div>
      </div>
    </PageCard>;
  }

  const title = decision?.action === "rest" ? "今天休息" : decision?.workout_type ? workoutTypeLabel(decision.workout_type) : prescription?.type ? workoutTypeLabel(prescription.type) : "今天没有安排课表";
  const duration = decision?.duration_min ?? prescription?.duration_min ?? null;
  const tss = decision?.target_tss ?? null;
  return <PageCard hero className="relative" >
    <div data-testid={testId}>
      <div className="eyebrow mb-1">今日安排 · {decision?.workout_type ? workoutTypeLabel(decision.workout_type) : prescription?.type ? workoutTypeLabel(prescription.type) : "未安排"}</div>
      <h2 className="text-title2 font-bold">{title}</h2>
      <div className="mt-3 grid grid-cols-3 gap-3">
        <Stat label="距离" value={distanceM != null ? (distanceM / 1000).toFixed(1) : "未记录"} unit={distanceM != null ? "km" : undefined} focal />
        <Stat label="时长" value={duration != null ? Math.round(duration) : "未记录"} unit={duration != null ? "min" : undefined} />
        <Stat label="预计 TSS" value={tss != null ? Math.round(tss) : "未记录"} />
      </div>
      {segments.length ? <ol className="mt-4 space-y-2">{segments.map((segment, index) => <li key={`${segment.type}-${index}`} className="flex items-start gap-3 rounded-lg bg-background/40 p-2.5 text-sm"><span className="w-8 shrink-0 text-xs font-semibold text-accent-strong">{String(index + 1).padStart(2, "0")}</span><div className="flex-1"><div>{segmentLabel(segment.type)}{segment.repetitions && segment.repetitions > 1 ? ` × ${segment.repetitions}` : ""}</div><div className="num text-sm text-muted-foreground">{segment.duration_min} min{segment.pace_min_s_km != null && segment.pace_max_s_km != null ? ` · ${formatPaceFromSeconds(segment.pace_min_s_km)}–${formatPaceFromSeconds(segment.pace_max_s_km)}/km` : ""}</div></div></li>)}</ol> : null}
      {decision ? <div className="mt-4 rounded-xl border border-warn/30 bg-warn/10 p-3"><div className="flex items-center gap-2 font-semibold text-warn"><AlertTriangle className="h-4 w-4" />训练建议</div><p className="mt-1 text-sm">{decision.reason}</p></div> : null}
      <div className="mt-3 flex items-center justify-between gap-2 text-xs text-muted-foreground"><span>{linkedActivityId ? "今日活动已完成" : "今日尚未完成活动"}</span><Link href={linkedActivityId ? `/activities/${linkedActivityId}` : "/calendar"} className="text-accent-strong">{linkedActivityId ? "查看活动" : "查看课表"}</Link></div>
    </div>
  </PageCard>;
}
