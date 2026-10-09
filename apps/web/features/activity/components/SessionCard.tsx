"use client";

import { useRouter } from "next/navigation";
import { Card } from "@shared/ui/Card";
import { Badge } from "@shared/ui/Badge";
import {
  formatDistance,
  formatDuration,
  formatDate,
  formatPace,
  formatPower,
  formatHeartRate,
  formatCalories,
} from "@shared/lib/format";
import { getSportConfig } from "@shared/config/sport-config";
import { RouteBackground } from "@features/today/components/RouteBackground";
import {
  classifySession,
  type SessionEffort,
} from "@features/activity/lib/session-classification";
import type { ActivitySummary } from "@shared/types/activity";

export interface SessionCardProps {
  readonly activity: ActivitySummary;
  readonly onClick?: () => void;
  /** Render the GPS route as a faint background texture (needs summary_polyline). */
  readonly showRoute?: boolean;
}

const EFFORT_VARIANT: Readonly<
  Record<SessionEffort, "success" | "warning" | "error" | "neutral">
> = {
  easy: "success",
  moderate: "warning",
  hard: "error",
  unknown: "neutral",
};

const EFFORT_FILLED: Readonly<Record<SessionEffort, string>> = {
  easy: "bg-success",
  moderate: "bg-warning",
  hard: "bg-error",
  unknown: "bg-surface-overlay",
};

const EFFORT_SEGMENTS: readonly SessionEffort[] = ["easy", "moderate", "hard"];

function effortSegmentClass(
  segment: SessionEffort,
  current: SessionEffort,
): string {
  if (current === "unknown") return "bg-surface-overlay";
  return segment === current ? EFFORT_FILLED[current] : "bg-surface-overlay";
}

function tssText(tss: number | null): string {
  return tss != null ? String(Math.round(tss)) : "--";
}

function buildMetrics(activity: ActivitySummary): readonly string[] {
  const cfg = getSportConfig(activity.sport);
  if (cfg.isRun) {
    return [
      formatDistance(activity.distance_m),
      formatDuration(activity.duration_s),
      formatPace(activity.avg_speed),
      formatHeartRate(activity.avg_hr),
    ];
  }
  if (cfg.isRide) {
    return [
      formatDistance(activity.distance_m),
      formatDuration(activity.duration_s),
      activity.np != null ? formatPower(activity.np) : "--",
      activity.avg_power != null
        ? formatPower(activity.avg_power)
        : formatPace(activity.avg_speed),
    ];
  }
  if (cfg.isWater) {
    return [
      formatDistance(activity.distance_m),
      formatDuration(activity.duration_s),
      formatPace(activity.avg_speed),
    ];
  }
  if (activity.sport === "Workout" || activity.sport === "WeightTraining") {
    return [
      formatDuration(activity.duration_s),
      formatCalories(activity.calories),
      tssText(activity.tss),
    ];
  }
  return [
    activity.distance_m != null ? formatDistance(activity.distance_m) : "--",
    formatDuration(activity.duration_s),
    formatHeartRate(activity.avg_hr),
    tssText(activity.tss),
  ];
}

export function SessionCard({
  activity,
  onClick,
  showRoute = false,
}: SessionCardProps) {
  const router = useRouter();
  const sportConfig = getSportConfig(activity.sport);
  const { label, effort } = classifySession(activity);
  const metrics = buildMetrics(activity);

  const handleSelect = () => {
    if (onClick) {
      onClick();
      return;
    }
    router.push(`/activities/${activity.activity_id}`);
  };

  return (
    <Card
      padding="sm"
      onClick={handleSelect}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          handleSelect();
        }
      }}
      tabIndex={0}
      role="link"
      className="group card-interactive relative min-h-[44px] cursor-pointer overflow-hidden focus-ring sm:min-h-[64px] transition-all duration-200 hover:-translate-y-0.5 hover:shadow-md hover:border-border"
    >
      {showRoute && (
        <RouteBackground
          polyline={activity.summary_polyline}
          sportColor={sportConfig.color}
        />
      )}
      <div className="relative flex flex-col gap-2.5 sm:flex-row sm:items-center sm:justify-between">
        <div className="min-w-0 flex-1">
          <div className="flex min-w-0 flex-wrap items-center gap-x-2.5 gap-y-1">
            <span
              className="text-sm font-bold text-text-primary group-hover:text-accent-strong truncate"
              data-testid="session-card-label"
            >
              {label}
            </span>
            <span className="font-mono text-xs text-text-muted">
              {formatDate(activity.start_time)}
            </span>
            {activity.tss != null && (
              <Badge variant={EFFORT_VARIANT[effort]} className="text-caption1 px-1.5 py-0">
                TSS {Math.round(activity.tss)}
              </Badge>
            )}
          </div>

          <div
            className="mt-1.5 flex flex-wrap items-baseline gap-x-3.5 gap-y-1 text-xs *:font-mono *:tabular-nums"
            data-testid="session-card-metrics"
          >
            {metrics.map((value, idx) => (
              <span
                key={idx}
                className={idx === 0 ? "text-caption1 font-semibold text-text-primary" : "text-caption2 text-text-secondary font-medium"}
                data-testid="session-card-metric"
              >
                {value}
              </span>
            ))}
          </div>
        </div>

        <div
          className="flex h-1 w-full gap-0.5 overflow-hidden rounded-full sm:w-24"
          data-testid="session-card-effort-strip"
          role="presentation"
        >
          {EFFORT_SEGMENTS.map((seg) => (
            <div
              key={seg}
              data-effort-segment={seg}
              className={`flex-1 rounded-full ${effortSegmentClass(seg, effort)}`}
            />
          ))}
        </div>
      </div>
    </Card>
  );
}
