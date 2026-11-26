import { getSportConfig } from "@shared/config/sport-config";
import { HEART_RATE_UNIT } from "@shared/config/terms";
import { formatPaceFromSeconds } from "@shared/lib/format";
import { Badge } from "@shared/ui/Badge";
import { Card } from "@shared/ui/Card";
import { ReadingStrip, type Reading } from "@shared/ui/ReadingStrip";

import type { PublicActivity } from "../hooks/useShareActivity";
import { sportIconFor } from "../lib/sport-icon";
import { ShareShell } from "./ShareShell";

function pacePerKm(activity: PublicActivity): number | null {
  if (activity.distance_m == null || activity.duration_s == null) return null;
  if (activity.distance_m <= 0 || activity.duration_s <= 0) return null;
  return activity.duration_s / (activity.distance_m / 1000);
}

/**
 * The public face of one activity.
 *
 * A visitor has no account, so there is no rail, no tabs and no navigation: the
 * page is the record. Only the fields the share endpoint exposes are shown.
 */
export function ShareActivityView({ activity }: { readonly activity: PublicActivity }) {
  const config = getSportConfig(activity.sport);
  const pace = config.isStrength ? null : pacePerKm(activity);

  const readings: Reading[] = config.isStrength
    ? [
        {
          label: "时长",
          value: activity.duration_s != null ? String(Math.round(activity.duration_s / 60)) : null,
          unit: activity.duration_s != null ? "分钟" : null,
        },
        {
          label: "平均心率",
          value: activity.avg_hr != null ? String(Math.round(activity.avg_hr)) : null,
          unit: activity.avg_hr != null ? HEART_RATE_UNIT : null,
        },
      ]
    : [
        {
          label: "距离",
          value: activity.distance_m != null ? (activity.distance_m / 1000).toFixed(1) : null,
          unit: activity.distance_m != null ? "km" : null,
        },
        {
          label: "时长",
          value: activity.duration_s != null ? String(Math.round(activity.duration_s / 60)) : null,
          unit: activity.duration_s != null ? "分钟" : null,
        },
        {
          label: "平均配速",
          value: pace != null ? formatPaceFromSeconds(pace) : null,
          unit: pace != null ? "/km" : null,
          note: pace == null ? "没有速度数据" : undefined,
        },
        ...(activity.avg_hr != null
          ? [
              {
                label: "平均心率",
                value: String(Math.round(activity.avg_hr)),
                unit: HEART_RATE_UNIT,
              },
            ]
          : []),
      ];

  return (
    <ShareShell>
      <Card padding="lg" className="w-full max-w-2xl" data-testid="share-activity-card">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <Badge
            variant="neutral"
            className="flex items-center gap-1.5"
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
