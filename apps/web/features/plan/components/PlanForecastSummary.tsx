"use client";

import { Badge } from "@shared/ui/Badge";
import type { CalendarEventDTO } from "@features/calendar/components/types";

interface Props {
  events: readonly CalendarEventDTO[];
}

function isScheduledWorkout(event: CalendarEventDTO): boolean {
  return event.category !== "activity" && event.training_type !== "race"
    && event.status !== "deleted" && event.done !== true;
}

function plannedList(events: readonly CalendarEventDTO[]): CalendarEventDTO[] {
  return events.filter(isScheduledWorkout);
}

function scheduledDistance(events: readonly CalendarEventDTO[]): number | null {
  let total = 0;
  for (const event of events) {
    if (event.category === "activity") continue;
    const distance = event.predicted_distance_m;
    if (distance == null) return null;
    total += distance;
  }
  return total;
}

/**
 * 移动端训练计划摘要，展示有计划活动的距离。
 */
export function PlanForecastSummary({ events }: Props) {
  const scheduled = plannedList(events);
  const totalDistance = scheduledDistance(scheduled);

  if (scheduled.length === 0) {
    return (
      <div className="flex flex-col gap-2 py-2 text-center" data-testid="plan-forecast-summary-empty">
        <p className="text-subheadline font-semibold text-text-primary">训练安排</p>
        <p className="text-caption1 text-text-secondary">日历中尚无计划训练，添加训练后即可查看安排</p>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-3 py-2" data-testid="plan-forecast-summary">
      <div className="flex items-baseline justify-between gap-3">
        <p className="text-subheadline font-semibold text-text-primary">训练安排</p>
        <Badge variant="neutral">{scheduled.length} 节</Badge>
      </div>
      <p className="text-caption1 text-text-secondary">
        计划距离：{totalDistance === null ? "待补充距离信息" : `${(totalDistance / 1000).toFixed(1)} km`}
      </p>
    </div>
  );
}
