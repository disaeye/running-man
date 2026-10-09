import Link from "next/link";
import { Badge } from "@shared/ui/Badge";
import {
  formatDistance,
  formatDuration,
  formatHeartRate,
  toISODate,
} from "@shared/lib/format";
import { getSportConfig } from "@shared/config/sport-config";
import type { ActivitySummary } from "@shared/types/activity";

interface Props {
  readonly activity: ActivitySummary;
}

export function DayActivitySummary({ activity }: Props) {
  const cfg = getSportConfig(activity.sport);
  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center gap-3">
        <span className="flex h-10 w-10 items-center justify-center rounded-full bg-accent/12 text-subheadline font-bold text-accent-strong">
          {cfg.label.charAt(0)}
        </span>
        <div>
          <p className="text-body font-semibold text-text-primary">{cfg.label} · 训练详情</p>
          <p className="font-mono text-footnote text-text-muted">{toISODate(new Date(activity.start_time))}</p>
        </div>
      </div>
      <div className="grid grid-cols-2 gap-3 rounded-lg border border-border-default bg-surface-card p-4">
        <div>
          <p className="text-caption1 font-semibold uppercase tracking-wider text-text-secondary">距离</p>
          <p className="mt-1 font-mono text-title3 font-bold text-text-primary">{formatDistance(activity.distance_m)}</p>
        </div>
        <div>
          <p className="text-caption1 font-semibold uppercase tracking-wider text-text-secondary">时长</p>
          <p className="mt-1 font-mono text-title3 font-bold text-text-primary">{formatDuration(activity.duration_s)}</p>
        </div>
        <div>
          <p className="text-caption2 font-semibold uppercase tracking-wider text-text-secondary">TSS</p>
          <p className="mt-1 font-mono text-title3 font-bold text-text-primary">
            {activity.tss != null ? Math.round(activity.tss) : "--"}
          </p>
        </div>
        <div>
          <p className="text-caption1 font-semibold uppercase tracking-wider text-text-secondary">平均心率</p>
          <p className="mt-1 font-mono text-title3 font-bold text-text-primary">{formatHeartRate(activity.avg_hr)}</p>
        </div>
      </div>
      {activity.tss != null && (
        <Badge variant={activity.tss >= 100 ? "error" : activity.tss >= 50 ? "warning" : "success"}>
          {activity.tss >= 100 ? "高强度" : activity.tss >= 50 ? "中等强度" : "低强度"}
        </Badge>
      )}
      <Link
        href={`/activities/${activity.activity_id}`}
        className="focus-ring inline-flex items-center gap-1 self-start rounded-full bg-accent px-4 py-2 text-subheadline font-semibold text-accent-foreground transition-colors hover:bg-accent/90"
      >
        查看完整分析
      </Link>
    </div>
  );
}
