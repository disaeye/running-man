import Link from "next/link";
import {
  formatDistance,
  formatDuration,
  formatHeartRate,
  formatPaceFromSeconds,
  toISODate,
} from "@shared/lib/format";
import { NO_VALUE } from "@shared/lib/use-data-state";
import { activityDetailUrl } from "@shared/config/training-nav";
import { getSportConfig } from "@shared/config/sport-config";
import type { ActivitySummary } from "@shared/types/activity";

interface Props {
  readonly activity: ActivitySummary;
  readonly returnTo: string;
}

export function DayActivitySummary({ activity, returnTo }: Props) {
  const cfg = getSportConfig(activity.sport);
  const paceLabel =
    cfg.isRun && activity.distance_m && activity.duration_s && activity.distance_m > 0
      ? `${formatPaceFromSeconds((activity.duration_s * 1000) / activity.distance_m)}/km`
      : null;
  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center gap-3">
        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-accent/12 text-subheadline font-bold text-accent-strong">
          {cfg.label.charAt(0)}
        </span>
        <div className="min-w-0">
          <p className="truncate text-body font-semibold text-text-primary">
            {activity.name?.trim() || `${cfg.label} · 训练详情`}
          </p>
          <p className="font-mono text-footnote tabular-nums text-text-muted">
            {cfg.label} · {toISODate(new Date(activity.start_time))}
          </p>
        </div>
      </div>
      <div className="grid grid-cols-2 gap-3 rounded-lg border border-border-default bg-surface-card p-4">
        <div>
          <p className="text-caption1 font-semibold text-text-secondary">距离</p>
          <p className="mt-1 font-mono text-title3 font-bold tabular-nums text-text-primary">{formatDistance(activity.distance_m)}</p>
        </div>
        <div>
          <p className="text-caption1 font-semibold text-text-secondary">时长</p>
          <p className="mt-1 font-mono text-title3 font-bold tabular-nums text-text-primary">{formatDuration(activity.duration_s)}</p>
        </div>
        <div>
          <p className="text-caption1 font-semibold text-text-secondary">平均心率</p>
          <p className="mt-1 font-mono text-title3 font-bold tabular-nums text-text-primary">{formatHeartRate(activity.avg_hr)}</p>
        </div>
        <div>
          <p className="text-caption1 font-semibold text-text-secondary">{cfg.isRun ? "平均配速" : "训练负荷 TSS"}</p>
          <p className="mt-1 font-mono text-title3 font-bold tabular-nums text-text-primary">
            {cfg.isRun ? (paceLabel ?? NO_VALUE) : (activity.tss != null ? Math.round(activity.tss) : NO_VALUE)}
          </p>
        </div>
      </div>
      <Link
        href={activityDetailUrl(activity.activity_id, returnTo)}
        className="focus-ring inline-flex items-center gap-1 self-start rounded-full bg-accent px-4 py-2 text-subheadline font-semibold text-accent-foreground transition-colors hover:bg-accent/90"
      >
        查看完整分析
      </Link>
    </div>
  );
}
