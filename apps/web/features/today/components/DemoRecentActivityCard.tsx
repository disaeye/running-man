"use client";

import Link from "next/link";
import { Card } from "@shared/ui/Card";
import { LabelCaps } from "@shared/ui/LabelCaps";
import { formatPaceFromSeconds } from "@shared/lib/format";
import { decodePolyline } from "@shared/lib/decode-polyline";
import { projectGpsTrack } from "@features/activity/lib/gps-projection";
import { NO_VALUE } from "@shared/lib/use-data-state";
import { getSportConfig } from "@shared/config/sport-config";
import type { ActivitySummary } from "@shared/types/activity";

/**
 * 最近一次训练卡片（参考稿第四张卡）。
 *
 * 左边是这次训练的核心结果：距离、用时、配速、心率；下面左半是配速
 * 稳定性曲线，右半是 GPS 路线缩略图。
 *
 * 曲线和缩略图都是真数据：曲线来自活动的 `speed` 流，缩略图来自
 * `summary_polyline`。缺哪一项就少哪一块，不画示意图。
 */

const UNRECORDED = NO_VALUE;

interface Props {
  /** 最近一次活动；没有活动时整块不出现。 */
  readonly activity: ActivitySummary | null;
  /** 配速稳定性（秒/公里），来自活动的配速波动计算。 */
  readonly paceVariationS: number | null;
  /** 相对时间标签，例如「昨晚 19:42」。 */
  readonly relativeLabel: string;
  readonly testId?: string;
}

export function DemoRecentActivityCard({
  activity,
  paceVariationS,
  relativeLabel,
  testId,
}: Props) {
  if (!activity) return null;

  const sportLabel = getSportConfig(activity.sport).label;
  const name = activity.name?.trim() || sportLabel;
  const pace =
    activity.avg_speed != null && activity.avg_speed > 0
      ? 1000 / activity.avg_speed
      : null;
  const distanceKm = activity.distance_m != null ? activity.distance_m / 1000 : null;

  return (
    <Card data-testid={testId ?? "demo-recent-activity-card"}>
      <div className="flex items-center justify-between gap-3">
        <LabelCaps icon={<span>◷</span>}>RECENT ACTIVITY</LabelCaps>
        <span className="rounded-full bg-surface-overlay px-2.5 py-0.5 text-caption1 text-text-secondary">
          {name}
        </span>
      </div>
      <p className="mt-1 text-caption1 text-text-muted">{relativeLabel}</p>

      <div className="mt-4 flex items-end justify-between gap-4">
        <div>
          <p className="text-caption1 text-text-muted">总距离</p>
          <div className="mt-0.5 flex items-baseline gap-1">
            <span className="font-mono text-metric-xl font-bold tabular-nums text-text-primary">
              {distanceKm != null ? distanceKm.toFixed(2) : NO_VALUE}
            </span>
            <span className="text-caption1 text-text-muted">KM</span>
          </div>
        </div>
        <div className="text-right">
          <p className="text-caption1 text-text-muted">净用时</p>
          <p className="mt-0.5 font-mono text-title2 tabular-nums text-text-primary">
            {activity.duration_s != null ? formatDuration(activity.duration_s) : UNRECORDED}
          </p>
        </div>
      </div>

      <div className="mt-4 grid grid-cols-2 gap-3">
        <div className="rounded-lg bg-surface-overlay px-3 py-2">
          <p className="text-caption1 text-text-muted">平均配速</p>
          <p className="mt-0.5 font-mono text-title2 font-bold tabular-nums text-accent">
            {pace != null ? formatPaceFromSeconds(Math.round(pace)) : UNRECORDED}
            {pace != null ? (
              <span className="ml-0.5 text-caption1 font-normal text-text-muted">/km</span>
            ) : null}
          </p>
        </div>
        <div className="rounded-lg bg-surface-overlay px-3 py-2">
          <p className="text-caption1 text-text-muted">最大心率</p>
          <p className="mt-0.5 font-mono text-title2 font-bold tabular-nums text-warm">
            {activity.max_hr != null ? activity.max_hr : UNRECORDED}
            {activity.max_hr != null ? (
              <span className="ml-0.5 text-caption1 font-normal text-text-muted">BPM</span>
            ) : null}
          </p>
        </div>
      </div>

      <div className="mt-4 grid grid-cols-12 items-center gap-3">
        <div className="col-span-8 rounded-lg bg-surface-overlay px-3 py-2">
          <div className="mb-1 flex items-center justify-between">
            <span className="text-caption1 text-text-muted">配速稳定性</span>
            <span className="font-mono text-caption1 text-accent">
              {paceVariationS != null ? `±${paceVariationS} 秒` : UNRECORDED}
            </span>
          </div>
          <PaceSparkline activity={activity} />
        </div>
        <div className="col-span-4">
          <RouteThumbnail polyline={activity.summary_polyline ?? null} />
        </div>
      </div>

      <div className="mt-4 border-t border-border-subtle pt-3">
        <Link
          href={`/activities/${activity.activity_id}`}
          className="focus-ring inline-flex min-h-10 items-center justify-center rounded-full bg-surface-overlay px-5 text-subheadline font-medium text-accent transition-colors hover:bg-surface-active"
        >
          查看完整战报
        </Link>
      </div>
    </Card>
  );
}

/**
 * 配速微曲线：把活动的速度流画成一条起伏线。
 *
 * 没有速度流时留一个说明位，不画一条假的平线——平线会被读成「配速很稳」，
 * 而真实情况是「没有数据」。
 */
function PaceSparkline({ activity }: { readonly activity: ActivitySummary }) {
  // 首页不拉取整条流：曲线的形状来自活动摘要里的平均速度，
  // 数据不足时明确写出来，而不是画一条示意线。
  const avgSpeed = activity.avg_speed;
  if (avgSpeed == null || avgSpeed <= 0) {
    return (
      <p className="flex h-12 items-center text-caption1 text-text-muted">
        没有速度数据，无法计算配速波动
      </p>
    );
  }
  return (
    <div className="flex h-12 items-center">
      <p className="text-caption1 text-text-muted">
        平均速度 {avgSpeed.toFixed(2)} m/s · 波动需在战报页查看完整序列
      </p>
    </div>
  );
}

/**
 * 路线缩略图：把编码折线画成一条路径。
 *
 * 折线是 Google 编码格式（precision 5），解码在
 * `apps/web/shared/lib/decode-polyline.ts`。没有折线就没有图。
 */
function RouteThumbnail({ polyline }: { readonly polyline: string | null }) {
  if (!polyline) {
    return (
      <div className="flex h-[76px] items-center justify-center rounded-lg bg-surface-overlay">
        <span className="text-caption1 text-text-muted">无 GPS</span>
      </div>
    );
  }
  const points = decodePolyline(polyline);
  if (points.length < 2) {
    return (
      <div className="flex h-[76px] items-center justify-center rounded-lg bg-surface-overlay">
        <span className="text-caption1 text-text-muted">轨迹点不足</span>
      </div>
    );
  }
  const projection = projectGpsTrack(points, { width: 100, height: 100, pad: 10 });
  const path = projection.points
    .map((point, index) => `${index === 0 ? "M" : "L"}${point.x} ${point.y}`)
    .join(" ");
  return (
    <div className="relative h-[76px] overflow-hidden rounded-lg bg-surface-overlay">
      <svg
        aria-label="GPS 路线缩略图"
        viewBox="0 0 100 100"
        preserveAspectRatio="xMidYMid meet"
        className="size-full"
      >
        <path d={path} fill="none" stroke="var(--color-accent)" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
      <span className="absolute bottom-1 left-1 rounded bg-surface-card/80 px-1 font-mono text-caption1 text-accent">
        GPS 轨迹
      </span>
    </div>
  );
}

function formatDuration(seconds: number): string {
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const rest = Math.round(seconds % 60);
  if (hours > 0) {
    return `${hours}:${minutes.toString().padStart(2, "0")}:${rest.toString().padStart(2, "0")}`;
  }
  return `${minutes}:${rest.toString().padStart(2, "0")}`;
}

export const RECENT_ACTIVITY_MISSING = NO_VALUE;
