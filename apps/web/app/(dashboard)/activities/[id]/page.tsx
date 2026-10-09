"use client";

import { useState } from "react";
import { useParams } from "next/navigation";
import { AlertTriangle, RotateCcw, Share2, Info } from "lucide-react";
import { groupStreams } from "@shared/types/activity";
import { useActivityDetail } from "@features/activity/hooks/useActivityDetail";
import { useActivityStreams } from "@features/activity/hooks/useActivityStreams";
import { useActivityAnalysis } from "@features/activity/hooks/useActivityAnalysis";
import { StatsPanel } from "@features/activity/components/StatsPanel";
import { StrengthDetail } from "@features/activity/components/StrengthDetail";
import { ShareDialog } from "@features/activity/components/ShareDialog";
import { DataAvailabilityCard } from "@features/activity/components/DataAvailabilityCard";
import { ActivityFlagActions } from "@features/activity/components/ActivityFlagActions";
import { ActivityNullSemantics } from "@features/activity/components/ActivityNullSemantics";
import { ActivityWeatherCard } from "@features/activity/components/ActivityWeatherCard";
import { NonWeightSection } from "@features/activity/components/NonWeightSection";
import { getSportConfig } from "@shared/config/sport-config";
import { computeAvailability, extractId, sportSubtitle } from "@features/activity/lib/activity-detail";

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
      <div className="flex min-h-[400px] items-center justify-center p-8">
        <p className="text-sm text-muted-foreground animate-pulse" role="status" aria-busy="true">
          正在加载活动详情...
        </p>
      </div>
    );
  }

  if (activityQuery.error) {
    return <DetailError message={activityQuery.error} onRetry={activityQuery.reload} />;
  }

  if (!activityQuery.data) {
    return (
      <div className="flex min-h-[400px] items-center justify-center p-8 text-center">
        <p className="text-sm text-muted-foreground">未找到活动记录</p>
      </div>
    );
  }

  const activity = activityQuery.data;
  const streams = streamsQuery.data ?? [];
  const analysis = analysisQuery.data;
  const streamMap = groupStreams(streams);
  const config = getSportConfig(activity.sport);
  const date = new Date(activity.start_time).toLocaleString("zh-CN", {
    year: "numeric",
    month: "long",
    day: "numeric",
    weekday: "long",
    hour: "2-digit",
    minute: "2-digit",
  });
  const availability = computeAvailability(activity, streamMap, analysis);

  return (
    <div className="page-stack" data-testid="activity-detail-page">
      {/* 1. Header Banner */}
      <div
        className="rounded-3xl border border-border/70 p-6 shadow-xs backdrop-blur-md transition-all"
        style={{
          background: `linear-gradient(135deg, color-mix(in srgb, ${config.color} 15%, transparent), transparent 70%)`,
        }}
      >
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <span
              className="rounded-full border border-border/60 bg-card/60 px-3 py-1 text-xs font-semibold uppercase tracking-wider shadow-2xs"
              style={{ color: config.color }}
            >
              {config.label}
            </span>
            <p className="text-xs text-muted-foreground">{sportSubtitle(config)}</p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() => setShowTechnicalDetails((v) => !v)}
              className="inline-flex items-center gap-1.5 rounded-xl border border-border/70 bg-card/60 px-3 py-1.5 text-xs font-medium text-muted-foreground transition-colors hover:text-foreground hover:bg-card"
            >
              <Info className="h-3.5 w-3.5" />
              <span>{showTechnicalDetails ? "隐藏元数据" : "数据流状态"}</span>
            </button>
            <button
              type="button"
              onClick={() => setShareOpen(true)}
              className="inline-flex items-center gap-1.5 rounded-xl border border-border/70 bg-card/60 px-3.5 py-1.5 text-xs font-medium text-foreground transition-colors hover:border-primary/40 hover:bg-card"
            >
              <Share2 className="h-3.5 w-3.5 text-primary" />
              <span>分享</span>
            </button>
            <ActivityFlagActions activityId={id} onDone={activityQuery.reload} />
          </div>
        </div>

        <h1 className="mt-3 text-2xl sm:text-3xl font-bold tracking-tight text-foreground">
          {config.label}
        </h1>
        <p className="mt-1 text-xs sm:text-sm text-muted-foreground">{date}</p>
      </div>

      {/* 2. Core Stats Strip (First Priority) */}
      <div className="rounded-3xl border border-border/70 bg-card/60 p-6 shadow-xs backdrop-blur-md">
        <StatsPanel activity={activity} />
      </div>

      {activity.weather != null && <ActivityWeatherCard weather={activity.weather} />}

      {streamsQuery.loading && (
        <div className="rounded-2xl border border-border/50 bg-card/30 p-4 text-center">
          <p className="text-xs text-muted-foreground animate-pulse" role="status" aria-busy="true">
            正在加载轨迹与分段分析…
          </p>
        </div>
      )}

      {streamsQuery.error && (
        <div className="rounded-2xl border border-amber-500/30 bg-amber-500/10 px-4 py-3 text-xs text-amber-600 dark:text-amber-400" role="status">
          轨迹数据暂不可用，基础活动指标仍可查看。
        </div>
      )}

      {/* 3. Deep Analysis Section (GPS Map, Stream Charts, Laps, HR Zones) */}
      <div className="space-y-6">
        {activity.sport === "WeightTraining" ? (
          <StrengthDetail activityId={id} />
        ) : (
          <NonWeightSection activity={activity} streamMap={streamMap} analysis={analysis} />
        )}
      </div>

      {/* 4. Secondary Technical Availability & Diagnostics (Foldable) */}
      {showTechnicalDetails && (
        <div className="space-y-4 pt-4 border-t border-border/40">
          <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
            技术流诊断与元数据
          </h3>
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
          <ActivityNullSemantics
            activity={activity}
            streamMap={streamMap}
            analysis={analysis}
          />
        </div>
      )}

      <ShareDialog activityId={id} open={shareOpen} onClose={() => setShareOpen(false)} />
    </div>
  );
}

function DetailError({ message, onRetry }: { message: string; onRetry: () => void }) {
  return (
    <div className="mx-auto my-8 max-w-md rounded-3xl border border-rose-500/30 bg-rose-500/10 p-6 text-center text-rose-600 dark:text-rose-400">
      <AlertTriangle className="mx-auto h-8 w-8" aria-hidden="true" />
      <h2 className="mt-3 text-base font-bold">活动详情加载失败</h2>
      <p className="mt-1 text-xs text-rose-600/80 dark:text-rose-400/80">{message}</p>
      <button
        type="button"
        onClick={onRetry}
        className="mt-4 inline-flex items-center gap-2 rounded-full border border-border bg-card px-4 py-2 text-xs font-medium text-foreground transition-colors hover:bg-card/80"
      >
        <RotateCcw className="h-3.5 w-3.5" aria-hidden="true" />
        重新加载
      </button>
    </div>
  );
}
