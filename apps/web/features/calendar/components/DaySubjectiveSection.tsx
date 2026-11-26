"use client";

import { useState } from "react";
import { ChevronDown } from "lucide-react";
import { TrainingSubjective } from "@features/calendar/components/TrainingSubjective";
import type { ActivitySummary } from "@shared/types/activity";
import type { CalendarEventDTO } from "@features/calendar/components/types";
import type { WellnessPoint } from "@features/health/hooks/useWellness";

/**
 * 单日抽屉里的今日体感入口：默认只看当前值，点开才展开录入控件。
 * 其他日期不渲染，避免把「今天的状态」误写成历史日的属性。
 */
export function DaySubjectiveSection({
  day,
  today,
  events,
  activities,
  wellness,
  wellnessLoading,
  wellnessError,
  onRetryWellness,
  onSaved,
}: {
  readonly day: string;
  readonly today: string;
  readonly events: readonly CalendarEventDTO[];
  readonly activities: readonly ActivitySummary[];
  readonly wellness: WellnessPoint | null;
  readonly wellnessLoading: boolean;
  readonly wellnessError: string | null;
  readonly onRetryWellness: () => void;
  readonly onSaved: () => void;
}) {
  const [open, setOpen] = useState(false);
  if (day !== today) return null;

  const event = events.find((item) => item.status !== "deleted") ?? null;
  const soreness = wellness?.soreness != null ? `${Math.round(wellness.soreness)}/4` : "未记";
  const rpe = activities[0]?.rpe ?? event?.completed_rpe;
  const rpeText = rpe != null ? `${rpe}/10` : "未记";

  return (
    <section className="border-t border-border-subtle pt-3" aria-label="今日体感">
      <button
        type="button"
        aria-expanded={open}
        onClick={() => setOpen((prev) => !prev)}
        className="focus-ring tactile flex min-h-11 w-full items-center justify-between gap-2 rounded-lg text-left text-caption1 text-text-secondary hover:text-text-primary"
      >
        <span>
          今日体感
          <span className="num ml-1.5 text-text-muted">· 酸痛 {soreness} · RPE {rpeText}</span>
        </span>
        <ChevronDown className={`size-4 shrink-0 text-text-muted transition-transform ${open ? "rotate-180" : ""}`} aria-hidden />
      </button>
      {open ? (
        <div className="mt-2">
          <TrainingSubjective
            event={event}
            activities={activities}
            wellness={wellness}
            wellnessLoading={wellnessLoading}
            wellnessError={wellnessError}
            onRetryWellness={onRetryWellness}
            day={day}
            onSaved={onSaved}
            compact
          />
        </div>
      ) : null}
    </section>
  );
}
