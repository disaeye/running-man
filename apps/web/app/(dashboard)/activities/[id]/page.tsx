"use client";

import { useState } from "react";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import { useSWRConfig } from "swr";
import { AlertTriangle, RotateCcw, Share2 } from "lucide-react";
import { Card } from "@shared/ui/Card";
import { Page } from "@shared/ui/PageHeader";
import { ActivityDetailSkeleton } from "@features/activity/components/ActivityDetailSkeleton";
import { Button } from "@shared/ui/button";
import { useToast } from "@shared/ui/Toast";
import { apiErrorMessage, apiFetch } from "@shared/lib/api";
import { invalidateDataCards } from "@features/data/lib/invalidate-after-sync";
import { trainingReturnUrl } from "@shared/config/training-nav";
import { getSportConfig } from "@shared/config/sport-config";
import { useActivityDetail } from "@features/activity/hooks/useActivityDetail";
import { useSessionClassifications } from "@features/activity/hooks/useSessionClassifications";
import { useActivityStreams } from "@features/activity/hooks/useActivityStreams";
import { useActivityReportPrefetch } from "@features/activity/hooks/useActivityReportPrefetch";
import { groupStreams } from "@shared/types/activity";
import { computeAvailability, extractId } from "@features/activity/lib/activity-detail";
import { DataAvailabilityCard } from "@features/activity/components/DataAvailabilityCard";
import { ActivityReport } from "@features/activity/components/ActivityReport";
import { SessionClassificationPanel } from "@features/activity/components/SessionClassificationPanel";
import { ShareDialog } from "@features/activity/components/ShareDialog";
import { ActivityFlagActions } from "@features/activity/components/ActivityFlagActions";
import { activityDisplayName, activityOriginalName } from "@features/activity/lib/activity-display-name";

export default function ActivityDetailPage() {
  const params = useParams();
  const router = useRouter();
  const searchParams = useSearchParams();
  const { mutate } = useSWRConfig();
  const { toast } = useToast();
  const id = extractId(params);
  const activityQuery = useActivityDetail(id);
  const { byActivityId } = useSessionClassifications();
  const classification = byActivityId.get(id) ?? null;
  const streamsQuery = useActivityStreams(id);
  const [shareOpen, setShareOpen] = useState(false);
  const [retryingStreams, setRetryingStreams] = useState(false);
  useActivityReportPrefetch(id);

  if (activityQuery.loading) {
    return (
      <div className="page-stack">
        <div className="space-y-2 pb-2"><div className="h-4 w-28" /><div className="h-8 w-52" /></div>
        <ActivityDetailSkeleton />
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

  const handleBack = () => {
    const returnTo = trainingReturnUrl(searchParams.get("returnTo"));
    if (returnTo) {
      router.push(returnTo);
      return;
    }
    if (typeof window !== "undefined" && window.history.length > 1) {
      router.back();
      return;
    }
    router.push("/activities");
  };

  const canRetryStreams =
    activity.source === "intervals_icu" &&
    (!availability.hasGps || !(activity.has_hr ?? false));

  const handleRetryStreams = async () => {
    setRetryingStreams(true);
    try {
      await apiFetch(`/activities/${id}/streams/sync`, { method: "POST" });
      activityQuery.reload();
      streamsQuery.reload();
      await invalidateDataCards(mutate);
      toast("已重新拉取活动流数据", "success");
    } catch (caught) {
      toast(apiErrorMessage(caught, "拉取运动流失败"), "error");
    } finally {
      setRetryingStreams(false);
    }
  };

  return (
    <div className="content-arrival">
    <Page
      title={activityDisplayName(activity, classification)}
      eyebrow={formatTime(activity.start_time)}
      back
      onBack={handleBack}
      right={
        <Button type="button" variant="outline" size="sm" onClick={() => setShareOpen(true)}>
          <Share2 className="size-4" aria-hidden="true" />
          分享
        </Button>
      }
    >
      <div data-testid="activity-detail-page" className="space-y-4">
        <ActivityReport
          activityId={id}
          classificationSlot={!config.isStrength ? <SessionClassificationPanel activityId={id} originalName={activityOriginalName(activity)} /> : null}
        />

        <DataAvailabilityCard
          rows={[
            { label: "GPS 轨迹", ok: availability.hasGps },
            { label: "心率流", ok: activity.has_hr ?? false },
            { label: "步频/踏频", ok: activity.has_cadence ?? false },
            { label: "天气", ok: activity.weather != null },
          ]}
          source={activity.source || ""}
          fileType={activity.file_type || ""}
          onRetryStreams={canRetryStreams ? () => void handleRetryStreams() : undefined}
          retryingStreams={retryingStreams}
          actions={<ActivityFlagActions activityId={id} onDone={() => router.push("/activities")} />}
        />
      </div>

      <ShareDialog activityId={id} open={shareOpen} onClose={() => setShareOpen(false)} />
    </Page>
    </div>
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
