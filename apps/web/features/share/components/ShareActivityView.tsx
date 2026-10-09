import { Clock, Flame, Footprints, MapPin } from "lucide-react";

import { getSportConfig } from "@shared/config/sport-config";
import { Badge } from "@shared/ui/Badge";
import { Card } from "@shared/ui/Card";

import type { PublicActivity } from "../hooks/useShareActivity";
import { sportIconFor } from "../lib/sport-icon";
import { MetricCell } from "./MetricCell";

export function ShareActivityView({ activity }: { readonly activity: PublicActivity }) {
  const config = getSportConfig(activity.sport);
  const sportIcon = sportIconFor(activity.sport);

  const hasDirMetrics = activity.duration_s != null || activity.distance_m != null;
  const hasPhysMetrics = activity.avg_hr != null || activity.elevation_gain_m != null;
  const hasAnyMetrics = hasDirMetrics || hasPhysMetrics;

  return (
    <div
      className="flex min-h-[100dvh] flex-col items-center justify-center gap-5 bg-surface-base px-4 py-6"
      data-testid="share-activity-view"
    >
      <Card
        padding="lg"
        className="w-full max-w-md overflow-hidden"
        data-testid="share-activity-card"
      >
        {/* sport color accent strip */}
        <div
          className="mx-[-24px] -mt-6 mb-5 h-1"
          style={{ background: config.color }}
        />

        <div className="flex items-center gap-2">
          <Badge
            variant="neutral"
            className="flex items-center gap-1.5 rounded-md"
            data-testid="share-sport-badge"
          >
            {sportIcon}
            {config.label}
          </Badge>
        </div>

        <h1 className="mt-3 text-title1 font-semibold tracking-tight text-text-primary">
          {activity.name ?? config.label}
        </h1>
        <p className="mt-1 text-caption1 text-text-muted tabular-nums">{activity.date}</p>

        {hasAnyMetrics && (
          <div className="mt-5 grid grid-cols-2 gap-3">
            {activity.duration_s != null && (
              <MetricCell
                icon={<Clock className="size-3.5" aria-hidden="true" />}
                label="时长"
                value={`${Math.round(activity.duration_s / 60)} 分钟`}
              />
            )}
            {activity.distance_m != null && (
              <MetricCell
                icon={<MapPin className="size-3.5" aria-hidden="true" />}
                label="距离"
                value={`${(activity.distance_m / 1000).toFixed(1)} km`}
              />
            )}
            {activity.avg_hr != null && (
              <MetricCell
                icon={<Footprints className="size-3.5" aria-hidden="true" />}
                label="平均心率"
                value={`${activity.avg_hr} bpm`}
              />
            )}
            {activity.elevation_gain_m != null && (
              <MetricCell
                icon={<Flame className="size-3.5" aria-hidden="true" />}
                label="累计爬升"
                value={`${activity.elevation_gain_m} m`}
              />
            )}
          </div>
        )}

        {!hasAnyMetrics && (
          <p className="mt-5 text-caption1 text-text-muted">暂无详细数据</p>
        )}
      </Card>

      <p className="text-caption1 text-text-muted">Powered by Running Man</p>
    </div>
  );
}
