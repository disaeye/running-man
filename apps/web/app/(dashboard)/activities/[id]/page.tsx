"use client";

import { useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import { AlertTriangle, RotateCcw, Share2 } from "lucide-react";
import { Card } from "@shared/ui/Card";
import { Page } from "@shared/ui/Lovable";
import { LabelCaps } from "@shared/ui/LabelCaps";
import { getSportConfig } from "@shared/config/sport-config";
import { useActivityDetail } from "@features/activity/hooks/useActivityDetail";
import { useActivityStreams } from "@features/activity/hooks/useActivityStreams";
import { groupStreams } from "@shared/types/activity";
import { computeAvailability, extractId } from "@features/activity/lib/activity-detail";
import { ShareDialog } from "@features/activity/components/ShareDialog";
import { ActivityFlagActions } from "@features/activity/components/ActivityFlagActions";
import { ActivityRaceToggle } from "@features/activity/components/ActivityRaceToggle";
import { DataAvailabilityCard } from "@features/activity/components/DataAvailabilityCard";
import { DemoActivityReport } from "@features/activity/components/DemoActivityReport";

export default function ActivityDetailPage() {
  const params = useParams();
  const id = extractId(params);
  const activityQuery = useActivityDetail(id);
  const streamsQuery = useActivityStreams(id);
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
  const config = getSportConfig(activity.sport);
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
