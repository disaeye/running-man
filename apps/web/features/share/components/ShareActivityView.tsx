import { getSportConfig } from "@shared/config/sport-config";
import { HEART_RATE_UNIT } from "@shared/config/terms";
import { Badge } from "@shared/ui/Badge";
import { Card } from "@shared/ui/Card";
import { ReadingStrip, type Reading } from "@shared/ui/ReadingStrip";
import { NO_VALUE } from "@shared/lib/use-data-state";

import type { PublicActivity } from "../hooks/useShareActivity";
import { sportIconFor } from "../lib/sport-icon";
import { ShareShell } from "./ShareShell";

function pacePerKm(activity: PublicActivity): number | null {
  if (activity.distance_m == null || activity.duration_s == null) return null;
  if (activity.distance_m <= 0 || activity.duration_s <= 0) return null;
  return activity.duration_s / (activity.distance_m / 1000);
}

function formatPace(seconds: number): string {
  const minutes = Math.floor(seconds / 60);
  const rest = Math.round(seconds % 60);
  return `${minutes}'${String(rest).padStart(2, "0")}"`;
}

/**
 * The public face of one activity.
 *
 * A visitor has no account, so there is no rail, no tabs and no navigation: the
 * page is the record. Only the fields the share endpoint exposes are shown.
 */
export function ShareActivityView({ activity }: { readonly activity: PublicActivity }) {
  const config = getSportConfig(activity.sport);
  const pace = pacePerKm(activity);

  const readings: Reading[] = [
    {
      label: "距离",
      value:
        activity.distance_m != null ? `${(activity.distance_m / 1000).toFixed(1)} km` : NO_VALUE,
    },
    {
      label: "时长",
      value: activity.duration_s != null ? `${Math.round(activity.duration_s / 60)} 分钟` : NO_VALUE,
    },
    {
      label: "平均配速",
      value: pace != null ? `${formatPace(pace)} /km` : NO_VALUE,
      note: pace == null ? "没有速度数据" : undefined,
    },
    {
      label: "平均心率",
      value: activity.avg_hr != null ? `${Math.round(activity.avg_hr)} ${HEART_RATE_UNIT}` : "未记录",
    },
  ];

  return (
    <ShareShell>
      <Card padding="lg" className="w-full max-w-2xl" data-testid="share-activity-card">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <Badge
            variant="neutral"
            className="flex items-center gap-1.5 rounded-md"
            data-testid="share-sport-badge"
          >
            {sportIconFor(activity.sport)}
            {config.label}
          </Badge>
          <p className="text-caption1 tabular-nums text-text-muted">{activity.date}</p>
        </div>

        <h1 className="mt-3 text-title1 font-semibold tracking-tight text-text-primary">
          {activity.name ?? config.label}
        </h1>

        <ReadingStrip items={readings} className="mt-5" />

        {activity.elevation_gain_m != null && (
          <p className="mt-3 text-caption1 text-text-muted">
            累计爬升 {Math.round(activity.elevation_gain_m)} m
          </p>
        )}
      </Card>
    </ShareShell>
  );
}
