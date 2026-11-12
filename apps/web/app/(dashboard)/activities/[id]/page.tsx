"use client";

import { useParams } from "next/navigation";
import { AlertTriangle, RotateCcw } from "lucide-react";
import { Card } from "@shared/ui/Card";
import { Page } from "@shared/ui/Lovable";
import { getSportConfig } from "@shared/config/sport-config";
import { useActivityDetail } from "@features/activity/hooks/useActivityDetail";
import { useActivityStreams } from "@features/activity/hooks/useActivityStreams";
import { useActivityReportPrefetch } from "@features/activity/hooks/useActivityReportPrefetch";
import { groupStreams } from "@shared/types/activity";
import { computeAvailability, extractId } from "@features/activity/lib/activity-detail";
import { DataAvailabilityCard } from "@features/activity/components/DataAvailabilityCard";
import { DemoActivityReport } from "@features/activity/components/DemoActivityReport";
import { SessionClassificationPanel } from "@features/activity/components/SessionClassificationPanel";

export default function ActivityDetailPage() {
  const params = useParams();
  const id = extractId(params);
  const activityQuery = useActivityDetail(id);
  const streamsQuery = useActivityStreams(id);
  useActivityReportPrefetch(id);

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
    <Page
      title={activity.name?.trim() || config.label}
      eyebrow={formatTime(activity.start_time)}
      back
      onBack={() => history.back()}
    >
      <div data-testid="activity-detail-page" className="space-y-4">
        <SessionClassificationPanel activityId={id} />
        <DemoActivityReport activityId={id} />

        {/* 隐藏的元数据流可用性节点，用于后台分析与测试审计 */}
        <div className="hidden" aria-hidden="true">
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
