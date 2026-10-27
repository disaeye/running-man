"use client";

import { useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import { AlertTriangle, RotateCcw, Share2 } from "lucide-react";
import { groupStreams } from "@shared/types/activity";
import { Card } from "@shared/ui/Card";
import { MetricStrip, type MetricStripItem } from "@shared/ui/MetricStrip";
import { ActivityDetailHeader } from "@features/activity/components/ActivityDetailHeader";
import { useActivityDetail } from "@features/activity/hooks/useActivityDetail";
import { useActivityStreams } from "@features/activity/hooks/useActivityStreams";
import { useActivityAnalysis } from "@features/activity/hooks/useActivityAnalysis";
import { StrengthDetail } from "@features/activity/components/StrengthDetail";
import { ShareDialog } from "@features/activity/components/ShareDialog";
import { DataAvailabilityCard } from "@features/activity/components/DataAvailabilityCard";
import { ActivityFlagActions } from "@features/activity/components/ActivityFlagActions";
import { ActivityNullSemantics } from "@features/activity/components/ActivityNullSemantics";
import { ActivityWeatherCard } from "@features/activity/components/ActivityWeatherCard";
import { NonWeightSection } from "@features/activity/components/NonWeightSection";
import { getSportConfig } from "@shared/config/sport-config";
import { HEART_RATE_UNIT } from "@shared/config/terms";
import { formatDistance, formatDuration, formatPaceFromSeconds } from "@shared/lib/format";
import { computeAvailability, extractId } from "@features/activity/lib/activity-detail";

function pacePerKm(avgSpeed: number | null): number | null {
  if (avgSpeed == null || avgSpeed <= 0) return null;
  return 1000 / avgSpeed;
}

export default function ActivityDetailPage() {
  const params = useParams();
  const id = extractId(params);
  const activityQuery = useActivityDetail(id);
  const streamsQuery = useActivityStreams(id);
  const analysisQuery = useActivityAnalysis(id);
  const [shareOpen, setShareOpen] = useState(false);
  const [showTechnicalDetails, setShowTechnicalDetails] = useState(false);

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
  const streams = streamsQuery.data ?? [];
  const analysis = analysisQuery.data;
  const streamMap = groupStreams(streams);
  const config = getSportConfig(activity.sport);
  const availability = computeAvailability(activity, streamMap, analysis);
  const date = new Date(activity.start_time).toLocaleString("zh-CN", {
    year: "numeric",
    month: "long",
    day: "numeric",
    weekday: "long",
    hour: "2-digit",
    minute: "2-digit",
  });
  const pace = pacePerKm(activity.avg_speed);

  const readings: MetricStripItem[] = [
    { label: "距离", value: formatDistance(activity.distance_m) },
    { label: "时间", value: formatDuration(activity.duration_s) },
    {
      label: "平均配速",
      value: pace != null ? formatPaceFromSeconds(Math.round(pace)) : "未记录",
      unit: pace != null ? "/km" : undefined,
      note: pace != null ? undefined : "没有速度数据",
    },
    {
      label: "平均心率",
      value: activity.avg_hr != null ? String(Math.round(activity.avg_hr)) : "未记录",
      unit: activity.avg_hr != null ? HEART_RATE_UNIT : undefined,
      note: activity.avg_hr != null ? undefined : "这条记录没有心率",
    },
  ];

  return (
    <div className="page-stack" data-testid="activity-detail-page">
      <ActivityDetailHeader
        sportLabel={config.label}
        dateLabel={date}
        source={activity.source}
        technicalOpen={showTechnicalDetails}
        onToggleTechnical={() => setShowTechnicalDetails((value) => !value)}
        shareSlot={
          <>
            <button
              type="button"
              onClick={() => setShareOpen(true)}
              className="focus-ring inline-flex h-10 items-center gap-1.5 rounded-full border border-border-default px-3 text-caption1 font-medium text-text-secondary transition-colors hover:bg-surface-overlay hover:text-text-primary"
            >
              <Share2 className="size-3.5" aria-hidden="true" />
              分享
            </button>
            <ActivityFlagActions activityId={id} onDone={activityQuery.reload} />
          </>
        }
      />

      <MetricStrip columns={4} items={readings} />

      {activity.weather != null && <ActivityWeatherCard weather={activity.weather} />}

      {streamsQuery.loading && (
        <p className="text-caption1 text-text-muted" role="status" aria-busy="true">
          正在加载轨迹与分段…
        </p>
      )}

      {streamsQuery.error && (
        <p className="rounded-lg border border-warning/30 bg-warning/5 px-3 py-2 text-caption1 text-warning" role="status">
          轨迹数据暂不可用，基础指标仍可查看。
        </p>
      )}

      {activity.sport === "WeightTraining" ? (
        <StrengthDetail activityId={id} />
      ) : (
        <NonWeightSection activity={activity} streamMap={streamMap} analysis={analysis} />
      )}

      {showTechnicalDetails && (
        <Card padding="md">
          <h2 className="text-caption1 font-medium text-text-muted">数据流状态</h2>
          <div className="mt-3">
            <DataAvailabilityCard
              rows={[
                { label: "GPS 轨迹", ok: availability.hasGps },
                { label: "心率流", ok: availability.hasHr },
                { label: "功率流", ok: availability.hasPower },
                { label: "步频/踏频", ok: availability.hasCadence },
                { label: "分段标记", ok: availability.hasLaps },
              ]}
              source={activity.source || ""}
              fileType={activity.file_type || ""}
            />
          </div>
          <div className="mt-4 border-t border-border-subtle pt-4">
            <ActivityNullSemantics activity={activity} streamMap={streamMap} analysis={analysis} />
          </div>
        </Card>
      )}

      <ShareDialog activityId={id} open={shareOpen} onClose={() => setShareOpen(false)} />
    </div>
  );
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
