"use client";

import { useMemo, useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import { AlertTriangle, RotateCcw, Share2 } from "lucide-react";
import type { ActivitySummary } from "@shared/types/activity";
import { Card } from "@shared/ui/Card";
import { Page } from "@shared/ui/Lovable";
import { LabelCaps } from "@shared/ui/LabelCaps";
import { getSportConfig } from "@shared/config/sport-config";
import { useActivityDetail } from "@features/activity/hooks/useActivityDetail";
import { useActivities } from "@features/activity/hooks/useActivities";
import { useActivityStreams } from "@features/activity/hooks/useActivityStreams";
import { groupStreams } from "@shared/types/activity";
import { computeAvailability, extractId } from "@features/activity/lib/activity-detail";
import { ShareDialog } from "@features/activity/components/ShareDialog";
import { ActivityFlagActions } from "@features/activity/components/ActivityFlagActions";
import { ActivityRaceToggle } from "@features/activity/components/ActivityRaceToggle";
import { DataAvailabilityCard } from "@features/activity/components/DataAvailabilityCard";
import { DemoSessionSwitcher } from "@features/activity/components/DemoSessionSwitcher";
import { DemoActivityReport } from "@features/activity/components/DemoActivityReport";
import { athleteRange, useAthleteTimezone } from "@shared/lib/training-day";

/**
 * 单次训练详情页（按 stich_demo 的 analy.html 重排）。
 *
 * 页面本身只负责三件事：场次切换器、导出与分享、数据流状态。
 * 战报主体在 `DemoActivityReport` 里，分析页的「单次战报」模式用的是同一块，
 * 两处显示的内容因此不会各自走样。
 */
export default function ActivityDetailPage() {
  const params = useParams();
  const id = extractId(params);
  const activityQuery = useActivityDetail(id);
  const streamsQuery = useActivityStreams(id);
  const [shareOpen, setShareOpen] = useState(false);
  const [showTechnicalDetails, setShowTechnicalDetails] = useState(false);

  // 相邻的训练记录：最近 90 天内按时间排出的前后两个。
  const timezone = useAthleteTimezone();
  const range = useMemo(() => athleteRange(90, timezone), [timezone]);
  const siblings = useActivities(range.from, range.to);

  if (activityQuery.loading) {
    return (
      <div className="flex min-h-[320px] items-center justify-center">
        <p className="text-subheadline text-text-muted" role="status" aria-busy="true">
          正在加载活动详情…
        </p>
      </div>
    );
  }

  if (activityQuery.error) {
    return <DetailError message={activityQuery.error} onRetry={activityQuery.reload} />;
  }

  if (!activityQuery.data) {
    return (
      <Card padding="lg" className="text-center">
        <p className="text-subheadline text-text-secondary">未找到这条活动记录。</p>
        <Link
          href="/activities"
          className="focus-ring mt-3 inline-flex h-10 items-center rounded-full border border-border-default px-4 text-caption1 font-medium text-text-primary"
        >
          回到训练记录
        </Link>
      </Card>
    );
  }

  const activity = activityQuery.data;
  const config = getSportConfig(activity.sport);
  const adjacent = findAdjacent(siblings.data, activity.activity_id);
  const tags = buildTags(activity);
  const availability = computeAvailability(
    activity,
    groupStreams(streamsQuery.data),
    null,
  );

  return (
    <Page title={activity.name?.trim() || config.label} eyebrow={formatTime(activity.start_time)} back onBack={() => history.back()}>
    <div data-testid="activity-detail-page" className="space-y-4">
      <div className="flex items-center justify-between gap-3">
        <Link
          href="/activities"
          className="focus-ring inline-flex items-center gap-1 text-caption1 text-text-muted transition-colors hover:text-text-primary"
        >
          ‹ 训练记录
        </Link>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => setShowTechnicalDetails((value) => !value)}
            aria-expanded={showTechnicalDetails}
            className="focus-ring inline-flex h-10 items-center gap-1.5 rounded-full border border-border-default px-3 text-caption1 font-medium text-text-secondary transition-colors hover:bg-surface-overlay hover:text-text-primary"
          >
            {showTechnicalDetails ? "隐藏数据流状态" : "数据流状态"}
          </button>
          <button
            type="button"
            onClick={() => setShareOpen(true)}
            className="focus-ring inline-flex h-10 items-center gap-1.5 rounded-full border border-border-default px-3 text-caption1 font-medium text-text-secondary transition-colors hover:bg-surface-overlay hover:text-text-primary"
          >
            <Share2 className="size-3.5" aria-hidden="true" />
            分享
          </button>
          <ActivityRaceToggle activityId={id} isRace={activity.is_race ?? false} onDone={activityQuery.reload} />
          <ActivityFlagActions activityId={id} onDone={activityQuery.reload} />
        </div>
      </div>

      <DemoSessionSwitcher
        title={activity.name?.trim() || config.label}
        timeLabel={formatTime(activity.start_time)}
        tags={tags}
        previous={adjacent.previous}
        next={adjacent.next}
      />

      <DemoActivityReport activityId={id} />

      {showTechnicalDetails ? (
        <Card padding="md">
          <LabelCaps>DATA STREAMS · 数据流状态</LabelCaps>
          <div className="mt-3">
            <DataAvailabilityCard
              rows={[
                { label: "GPS 轨迹", ok: availability.hasGps },
                { label: "心率流", ok: activity.has_hr ?? false },
                { label: "步频/踏频", ok: activity.has_cadence ?? false },
                { label: "天气", ok: activity.weather != null },
              ]}
              source={activity.source || ""}
              fileType={activity.file_type || ""}
            />
          </div>
        </Card>
      ) : null}

      <div className="flex flex-wrap items-center gap-3 border-t border-border-subtle pt-4">
        <Link
          href="/activities"
          className="focus-ring inline-flex min-h-12 flex-1 items-center justify-center gap-2 rounded-xl bg-surface-overlay px-6 font-display text-subheadline font-bold uppercase tracking-wider text-text-primary transition-colors hover:bg-surface-active"
        >
          回到训练记录
        </Link>
      </div>

      <ShareDialog activityId={id} open={shareOpen} onClose={() => setShareOpen(false)} />
    </div>
    </Page>
  );
}

/**
 * 标签行：天气、步频、爬升。
 *
 * 只有真的有数据的标签才出现。
 */
function buildTags(activity: {
  weather?: { avg_temp?: number | null } | null;
  avg_cadence?: number | null;
  elevation_gain_m?: number | null;
}): string[] {
  const tags: string[] = [];
  if (activity.weather?.avg_temp != null) {
    tags.push(`天气 ${Math.round(activity.weather.avg_temp)}°C`);
  }
  if (activity.avg_cadence != null) {
    tags.push(`步频 ${Math.round(activity.avg_cadence)} rpm`);
  }
  if (activity.elevation_gain_m != null) {
    tags.push(`爬升 ${Math.round(activity.elevation_gain_m)} m`);
  }
  return tags;
}

/**
 * 这次训练前后各一次训练记录。
 *
 * 列表按开始时间倒序，所以「上一场」是时间上更早的那一条。
 */
function findAdjacent(
  activities: readonly ActivitySummary[],
  activityId: string,
): {
  previous: { activityId: string; label: string } | null;
  next: { activityId: string; label: string } | null;
} {
  const ordered = [...activities].sort((a, b) =>
    a.start_time < b.start_time ? 1 : a.start_time > b.start_time ? -1 : 0,
  );
  const index = ordered.findIndex((entry) => entry.activity_id === activityId);
  if (index < 0) return { previous: null, next: null };
  const older = ordered[index + 1] ?? null;
  const newer = ordered[index - 1] ?? null;
  return {
    previous: older ? { activityId: older.activity_id, label: formatTime(older.start_time) } : null,
    next: newer ? { activityId: newer.activity_id, label: formatTime(newer.start_time) } : null,
  };
}

function formatTime(startTime: string): string {
  return new Date(startTime).toLocaleString("zh-CN", {
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
}

function DetailError({ message, onRetry }: { message: string; onRetry: () => void }) {
  return (
    <Card padding="lg" className="text-center">
      <AlertTriangle className="mx-auto size-5 text-error" aria-hidden="true" />
      <h2 className="mt-2 text-subheadline font-medium text-error">活动详情加载失败</h2>
      <p className="mt-1 text-caption1 text-text-secondary">{message}</p>
      <button
        type="button"
        onClick={onRetry}
        className="focus-ring mt-4 inline-flex h-10 items-center gap-1.5 rounded-full border border-border-default px-4 text-caption1 font-medium text-text-primary"
      >
        <RotateCcw className="size-3.5" aria-hidden="true" />
        重新加载
      </button>
    </Card>
  );
}
