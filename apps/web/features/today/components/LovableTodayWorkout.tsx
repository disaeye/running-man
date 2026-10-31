"use client";

import Link from "next/link";
import { AlertTriangle } from "lucide-react";
import { PageCard, Stat } from "@shared/ui/Lovable";
import { formatPaceFromSeconds } from "@shared/lib/format";
import { workoutTypeLabel, segmentLabel } from "@features/today/lib/session-label";
import type { CalendarEventDTO } from "@features/calendar/components/types";
import type { CoachRecommendation } from "@features/today/hooks/useCoachContext";

export function LovableTodayWorkout({ decision, prescription, linkedActivityId, distanceM = null, testId }: {
  decision: CoachRecommendation | null;
  prescription: CalendarEventDTO["workout_prescription"] | null;
  linkedActivityId: string | null;
  distanceM?: number | null;
  testId?: string;
}) {
  const title = decision?.action === "rest" ? "今天休息" : decision?.workout_type ? workoutTypeLabel(decision.workout_type) : prescription?.type ? workoutTypeLabel(prescription.type) : "今天没有安排课表";
  const duration = decision?.duration_min ?? prescription?.duration_min ?? null;
  const tss = decision?.target_tss ?? null;
  const segments = prescription?.segments ?? [];
  return <PageCard hero className="relative" >
    <div data-testid={testId}>
      <div className="eyebrow mb-1">今日安排 · {decision?.workout_type ?? prescription?.type ?? "未安排"}</div>
      <h2 className="text-xl font-bold">{title}</h2>
      <div className="mt-3 grid grid-cols-3 gap-3">
        <Stat label="距离" value={distanceM != null ? (distanceM / 1000).toFixed(1) : "未记录"} unit={distanceM != null ? "km" : undefined} />
        <Stat label="时长" value={duration != null ? Math.round(duration) : "未记录"} unit={duration != null ? "min" : undefined} />
        <Stat label="预计 TSS" value={tss != null ? Math.round(tss) : "未记录"} />
      </div>
      {segments.length ? <ol className="mt-4 space-y-2">{segments.map((segment, index) => <li key={`${segment.type}-${index}`} className="flex items-start gap-3 rounded-lg bg-background/40 p-2.5 text-sm"><span className="w-8 shrink-0 text-xs font-semibold text-accent-strong">{String(index + 1).padStart(2, "0")}</span><div className="flex-1"><div>{segmentLabel(segment.type)}{segment.repetitions && segment.repetitions > 1 ? ` × ${segment.repetitions}` : ""}</div><div className="num text-sm text-muted-foreground">{segment.duration_min} min{segment.pace_min_s_km != null && segment.pace_max_s_km != null ? ` · ${formatPaceFromSeconds(segment.pace_min_s_km)}–${formatPaceFromSeconds(segment.pace_max_s_km)}/km` : ""}</div></div></li>)}</ol> : null}
      {decision ? <div className="mt-4 rounded-xl border border-warn/30 bg-warn/10 p-3"><div className="flex items-center gap-2 font-semibold text-warn"><AlertTriangle className="h-4 w-4" />训练建议</div><p className="mt-1 text-sm">{decision.reason}</p>{decision.risks.length ? <ul className="mt-2 space-y-1 text-xs text-muted-foreground">{decision.risks.map((risk) => <li key={risk}>· {risk}</li>)}</ul> : null}</div> : null}
      <div className="mt-3 flex items-center justify-between gap-2 text-xs text-muted-foreground"><span>{linkedActivityId ? "今日活动已完成" : "今日尚未完成活动"}</span><Link href={linkedActivityId ? `/activities/${linkedActivityId}` : "/calendar"} className="text-accent-strong">{linkedActivityId ? "查看活动" : "查看课表"}</Link></div>
    </div>
  </PageCard>;
}
