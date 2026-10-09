"use client";

import { Card } from "@shared/ui/Card";
import { Badge } from "@shared/ui/Badge";
import type { CalendarEventDTO } from "@features/calendar/components/types";
import type { WorkoutPredictionPoint } from "@features/calendar/components/types";

interface Props {
  events: readonly CalendarEventDTO[];
  points: readonly WorkoutPredictionPoint[];
  planned: Readonly<Record<string, number>>;
}

function isScheduledWorkout(event: CalendarEventDTO): boolean {
  return event.category !== "activity" && event.training_type !== "race"
    && event.status !== "deleted" && event.done !== true;
}

function plannedList(events: readonly CalendarEventDTO[]): CalendarEventDTO[] {
  return events.filter(isScheduledWorkout);
}

function weeklyTss(points: readonly WorkoutPredictionPoint[]): { planned: number; baseline: number } {
  if (points.length === 0) return { planned: 0, baseline: 0 };
  return {
    planned: points.reduce((sum, point) => sum + (point.projected_tss ?? 0), 0),
    baseline: points.reduce((sum, point) => sum + Math.max(0, point.projected_tss - 50), 0),
  };
}

function riskLevel(points: readonly WorkoutPredictionPoint[]): "high" | "moderate" | "fresh" {
  if (points.some((point) => point.is_overtraining_risk || point.is_high_load_risk)) return "high";
  if (points.some((point) => point.is_fresh)) return "fresh";
  return "moderate";
}

export function PlanForecastSummary({ events, points, planned }: Props) {
  const scheduled = plannedList(events);
  const hasPlan = Object.values(planned).some((value) => value > 0);

  if (scheduled.length === 0) {
    return (
      <Card padding="md" data-testid="plan-forecast-summary-empty">
        <div className="flex flex-col gap-2 py-2 text-center">
          <p className="text-subheadline font-semibold text-text-primary">28 日训练负荷</p>
          <p className="text-caption1 text-text-secondary">日历中尚无计划训练，先添加训练后即可查看预测</p>
        </div>
      </Card>
    );
  }

  if (!hasPlan || points.length === 0) {
    return (
      <Card padding="md" data-testid="plan-forecast-summary-pending">
        <div className="flex flex-col gap-2 py-2">
          <p className="text-subheadline font-semibold text-text-primary">28 日训练负荷</p>
          <p className="text-caption1 text-text-secondary">已计划 {scheduled.length} 节训练，补全 TSS 后可生成预测</p>
        </div>
      </Card>
    );
  }

  const { planned: weekTss } = weeklyTss(points);
  const risk = riskLevel(points);

  return (
    <Card padding="md" data-testid="plan-forecast-summary">
      <div className="flex flex-col gap-3">
        <div className="flex items-baseline justify-between gap-3">
          <p className="text-subheadline font-semibold text-text-primary">28 日训练负荷预测</p>
          <Badge variant={risk === "high" ? "error" : risk === "fresh" ? "success" : "warning"}>
            {risk === "high" ? "高风险" : risk === "fresh" ? "状态良好" : "中等负荷"}
          </Badge>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div className="rounded-lg border border-border-default bg-surface-card px-3 py-2">
            <p className="text-caption1 font-medium text-text-muted">28 日累计</p>
            <p className="mt-0.5 font-mono text-title3 font-bold tabular-nums text-text-primary">
              {Math.round(weekTss)}TSS
            </p>
          </div>
          <div className="rounded-lg border border-border-default bg-surface-card px-3 py-2">
            <p className="text-caption1 font-medium text-text-muted">计划训练</p>
            <p className="mt-0.5 font-mono text-title3 font-bold tabular-nums text-text-primary">
              {scheduled.length}<span className="text-footnote text-text-muted"> 节</span>
            </p>
          </div>
        </div>

        <p className="text-caption1 text-text-secondary">桌面端可见 7 序列趋势图与 TSB 区间标注</p>
      </div>
    </Card>
  );
}
