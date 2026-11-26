import Link from "next/link";
import { ChevronRight, Dumbbell, Footprints } from "lucide-react";
import {
  formatDate,
  formatDuration,
  formatHeartRate,
  formatPace,
} from "@shared/lib/format";
import { getSportConfig } from "@shared/config/sport-config";
import { MiniRouteThumbnail } from "@features/activity/components/MiniRouteThumbnail";
import { activityLocalDay, useAthleteTimezoneState } from "@shared/lib/training-day";
import {
  classifySession,
  type SessionEffort,
} from "@features/activity/lib/session-classification";
import { activityDisplayName } from "@features/activity/lib/activity-display-name";
import type { ActivitySummary } from "@shared/types/activity";
import type { SessionClassificationItem } from "@features/activity/hooks/useSessionClassifications";

const EFFORT_CLASS: Readonly<Record<SessionEffort, string>> = {
  easy: "bg-success",
  moderate: "bg-warning",
  hard: "bg-error",
  unknown: "bg-border-strong",
};

const EFFORT_LABEL: Readonly<Record<SessionEffort, string>> = {
  easy: "轻松",
  moderate: "中等强度",
  hard: "高强度",
  unknown: "强度未评估",
};

interface ActivitySummaryRowProps {
  readonly activity: ActivitySummary;
  readonly classification?: SessionClassificationItem | null;
  readonly href: string;
  readonly onClick?: () => void;
  readonly showRoute?: boolean;
}

function ActivityMetric({ label, value, unit }: {
  readonly label: string;
  readonly value: string;
  readonly unit?: string;
}) {
  const missing = value === "--" || value === "未记录";
  return (
    <div className="min-w-0" data-testid="session-card-metric">
      <dt className="text-caption1 text-text-muted">{label}</dt>
      <dd className="mt-0.5 flex flex-wrap items-baseline gap-x-1 text-text-primary">
        <span className={`num font-mono font-semibold tabular-nums ${missing ? "text-subheadline text-text-muted" : "text-title2"}`}>
          {missing ? "未记录" : value}
        </span>
        {!missing && unit ? <span className="text-caption1 text-text-secondary">{unit}</span> : null}
      </dd>
    </div>
  );
}

/**
 * 活动摘要行（对标 COROS Activities Feed / Garmin 活动列表）：
 * 左侧运动图标 + 标题元数据 + 右侧独立 GPS 路线缩略框 + 下沉遥测指标带。
 * 分类依据与置信度留在详情页的 SessionClassificationPanel，列表行不渲染审计段落。
 */
export function ActivitySummaryRow({
  activity,
  classification,
  href,
  onClick,
  showRoute = false,
}: ActivitySummaryRowProps) {
  const { timezone } = useAthleteTimezoneState();
  const sport = getSportConfig(activity.sport);
  const { effort } = classifySession(activity);
  const Icon = sport.isStrength ? Dumbbell : Footprints;
  const distance = activity.distance_m;
  const primaryMetric = sport.isStrength
    ? { label: "时长", value: formatDuration(activity.duration_s) }
    : distance == null
      ? { label: "距离", value: "未记录" }
      : distance >= 1000
        ? { label: "距离", value: (distance / 1000).toFixed(1), unit: "km" }
        : { label: "距离", value: String(Math.round(distance)), unit: "m" };

  return (
    <Link
      href={href}
      onClick={onClick}
      className="focus-ring group relative block min-w-0 rounded-2xl px-4 py-4 transition-colors hover:bg-surface-overlay/70 active:bg-surface-active sm:px-5"
    >
      <div className="flex items-start gap-3">
        <span
          className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-surface-overlay"
          style={{ color: sport.color }}
        >
          <Icon className="size-5" strokeWidth={1.8} aria-hidden="true" />
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex items-start justify-between gap-2">
            <span data-testid="session-card-label" className="min-w-0 break-words text-body font-semibold leading-snug text-text-primary group-hover:text-accent-strong">
              {activityDisplayName(activity, classification)}
            </span>
          </div>
          <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-caption1 text-text-secondary">
            <span>{sport.label}</span>
            <span aria-hidden="true">·</span>
            <time className="num font-mono" dateTime={activity.start_time}>
              {activityLocalDay(activity.start_time, timezone) || formatDate(activity.start_time)}
            </time>
            {activity.is_race ? <span className="rounded-full bg-warn/15 px-2 py-0.5 font-medium text-warm">比赛</span> : null}
          </div>
        </div>
        {showRoute ? (
          <MiniRouteThumbnail polyline={activity.summary_polyline} sportColor={sport.color} />
        ) : null}
        <ChevronRight className="mt-2 size-5 shrink-0 text-text-muted transition-transform group-hover:translate-x-0.5 group-hover:text-accent-strong" aria-hidden="true" />
      </div>

      <dl data-testid="session-card-metrics" className="mt-3 grid grid-cols-3 gap-x-3 gap-y-2 rounded-xl bg-surface-overlay p-3">
        <ActivityMetric {...primaryMetric} />
        {!sport.isStrength ? (
          <>
            <ActivityMetric label="时长" value={formatDuration(activity.duration_s)} />
            <ActivityMetric label="平均配速" value={activity.avg_speed != null && activity.avg_speed > 0 ? formatPace(activity.avg_speed) : "未记录"} unit="/km" />
          </>
        ) : (
          <>
            <ActivityMetric label="平均心率" value={activity.avg_hr != null ? String(Math.round(activity.avg_hr)) : "未记录"} unit="bpm" />
            <ActivityMetric label="卡路里" value={activity.calories != null ? String(Math.round(activity.calories)) : "未记录"} unit="kcal" />
          </>
        )}
      </dl>

      <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1.5 text-caption1 text-text-secondary">
        <span className="inline-flex items-center gap-1.5">
          <span className={`size-2 shrink-0 rounded-full ${EFFORT_CLASS[effort]}`} aria-hidden="true" />
          {EFFORT_LABEL[effort]}
        </span>
        {!sport.isStrength ? <span>平均心率 <span className="num">{activity.avg_hr != null ? formatHeartRate(activity.avg_hr) : "未记录"}</span></span> : null}
        <span>TSS <span className="num">{activity.tss != null ? Math.round(activity.tss) : "未记录"}</span></span>
      </div>
    </Link>
  );
}
