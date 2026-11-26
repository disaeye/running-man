"use client";

import { useMemo, useState } from "react";
import { Badge } from "@shared/ui/Badge";
import { Button } from "@shared/ui/button";
import { formatRelativeTime } from "@shared/lib/format";
import type { IntegrationStatus } from "@features/data/hooks/useIntegrations";
import { useSyncRuns } from "@features/data/hooks/useSyncRuns";
import {
  cancelSyncJob,
  isJobActive,
  useSourceCoverage,
  useSyncJob,
} from "@features/data/hooks/useSyncJobs";

interface SyncStatusOverviewProps {
  integrations: { intervals_icu: IntegrationStatus | null };
  onTriggerSync?: (source: "intervals_icu") => void;
  syncingSource?: string | null;
}

const PHASE_LABELS: Record<string, string> = {
  activities: "拉取活动记录",
  streams: "解析时序流 (FIT)",
  wellness: "同步健康日志",
  weather: "补充天气记录",
};

export function SyncStatusOverview({
  integrations,
  onTriggerSync,
  syncingSource,
}: SyncStatusOverviewProps) {
  const { data: runs } = useSyncRuns({ limit: 10 });
  const { job } = useSyncJob("intervals_icu");
  const { coverage } = useSourceCoverage("intervals_icu");
  const [cancelling, setCancelling] = useState(false);

  const activeJob = isJobActive(job) ? job : null;
  const isSyncing = syncingSource === "intervals_icu" || activeJob !== null;
  // A webhook or a backfill can move data without writing a run record, so the
  // source's own last_sync_at is the fallback — otherwise this card says 未执行
  // next to a card above it saying 最后同步 5 分钟前.
  const lastSyncAt = integrations.intervals_icu?.last_sync ?? null;

  const handleCancel = async () => {
    if (!activeJob) return;
    setCancelling(true);
    try {
      await cancelSyncJob("intervals_icu", activeJob.id);
    } finally {
      setCancelling(false);
    }
  };

  const stats = useMemo(() => {
    const connectedCount = Object.values(integrations).filter(
      (i) => i?.status === "connected",
    ).length;

    const latestRun = runs.length > 0 ? runs[0] : null;

    const successfulRuns = runs.filter((r) => r.status === "success").length;
    const failedRuns = runs.filter((r) => r.status === "failed").length;

    let totalUpserted = 0;
    let totalStreams = 0;
    for (const r of runs) {
      totalUpserted += r.activities_upserted || 0;
      totalStreams += r.streams_inserted || 0;
    }

    return {
      connectedCount,
      latestRun,
      successfulRuns,
      failedRuns,
      totalUpserted,
      totalStreams,
    };
  }, [integrations, runs]);

  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
      {/* Connected Sources Status */}
      <div className="flex flex-col justify-between rounded-2xl bg-surface-card p-4">
        <div>
          <span className="text-caption1 font-medium text-text-muted">
            数据源连接状态
          </span>
          <div className="mt-2 flex items-baseline gap-2">
            <span className="text-title1 font-bold text-text-primary">
              {stats.connectedCount}
            </span>
            <span className="text-caption1 text-text-muted">
              / {Object.keys(integrations).length} 个已连接
            </span>
          </div>
        </div>
        <div className="mt-3 flex items-center gap-2">
          <Badge
            variant={
              integrations.intervals_icu?.status === "connected"
                ? "success"
                : "neutral"
            }
          >
            Intervals.icu:{" "}
            {integrations.intervals_icu?.status === "connected"
              ? "已连接"
              : "未连接"}
          </Badge>
        </div>
      </div>

      {/* Latest Sync Snapshot */}
      <div className="flex flex-col justify-between rounded-2xl bg-surface-card p-4">
        <div>
          <span className="text-caption1 font-medium text-text-muted">
            {activeJob ? "实时同步进度" : "最近一次同步"}
          </span>
          <div className="mt-2 flex items-center justify-between">
            <span className="text-headline font-bold text-text-primary truncate">
              {activeJob
                ? `${PHASE_LABELS[activeJob.phase] ?? activeJob.phase}`
                : stats.latestRun?.started_at
                  ? formatRelativeTime(stats.latestRun.started_at)
                  : lastSyncAt
                    ? formatRelativeTime(lastSyncAt)
                    : "未执行"}
            </span>
            {activeJob ? (
              <Badge variant="info">
                {activeJob.cancelRequested ? "取消中" : "执行中"}
              </Badge>
            ) : stats.latestRun ? (
              <Badge
                variant={
                  stats.latestRun.status === "success"
                    ? "success"
                    : stats.latestRun.status === "partial"
                      ? "warning"
                      : stats.latestRun.status === "running"
                        ? "info"
                        : "error"
                }
              >
                {stats.latestRun.status === "success"
                  ? "成功"
                  : stats.latestRun.status === "partial"
                    ? "部分完成"
                    : stats.latestRun.status === "running"
                      ? "同步中"
                      : "失败"}
              </Badge>
            ) : null}
          </div>
        </div>
        <div className="mt-3 text-caption1 text-text-muted">
          {activeJob
            ? activeJob.windowsTotal > 0
              ? `窗口 ${activeJob.windowsDone}/${activeJob.windowsTotal} · 新增 +${activeJob.activitiesUpserted} · 流 +${activeJob.streamsInserted}`
              : `已见 ${activeJob.activitiesSeen} · 新增 +${activeJob.activitiesUpserted} · 流 +${activeJob.streamsInserted}`
            : stats.latestRun
              ? `来源: ${stats.latestRun.source === "intervals_icu" ? "Intervals" : stats.latestRun.source} · 新增 +${stats.latestRun.activities_upserted} 条`
              : lastSyncAt
                ? "这次同步没有留下运行记录"
                : "暂无同步记录"}
        </div>
      </div>

      {/* Synchronized Volume stats */}
      <div className="flex flex-col justify-between rounded-2xl bg-surface-card p-4">
        <div>
          <span className="text-caption1 font-medium text-text-muted">
            近期入库与流数据
          </span>
          <div className="mt-2 flex items-baseline gap-2">
            <span className="text-title1 font-bold tabular-nums text-accent-strong">
              {stats.totalUpserted}
            </span>
            <span className="text-caption1 text-text-muted">条活动更新</span>
          </div>
        </div>
        <div className="mt-3 space-y-1 text-caption1 text-text-muted">
          <div>
            已写入{" "}
            <span className="font-semibold tabular-nums text-text-secondary">
              {stats.totalStreams}
            </span>{" "}
            条秒级数据
          </div>
          {integrations.intervals_icu?.status === "connected" && coverage?.firstActivityDate ? (
            <div className="num text-text-secondary">
              已覆盖 {coverage.firstActivityDate} 至 {coverage.lastActivityDate}（{coverage.activityCount} 条活动）
            </div>
          ) : (
            <div>首次同步默认拉近 30 天，更早记录可在下方「导入历史」按月回填</div>
          )}
        </div>
      </div>

      {/* Sync Health & Quick Action */}
      <div className="flex flex-col justify-between rounded-2xl bg-surface-card p-4">
        <div>
          <span className="text-caption1 font-medium text-text-muted">
            同步稳定性
          </span>
          <div className="mt-2 flex items-center justify-between">
            <span className="text-headline font-bold text-text-primary">
              {runs.length === 0 ? (
                <span className="text-text-muted">还没有同步记录</span>
              ) : stats.failedRuns > 0 ? (
                <span className="text-error">{stats.failedRuns} 次异常</span>
              ) : (
                <span className="text-success">全部成功</span>
              )}
            </span>
            {runs.length > 0 && (
              <Badge variant={stats.failedRuns > 0 ? "warning" : "success"}>
                {stats.successfulRuns}/{runs.length} 成功
              </Badge>
            )}
          </div>
        </div>
        <div className="mt-3 flex items-center gap-2">
          {integrations.intervals_icu?.status === "connected" && activeJob ? (
            <Button
              size="xs"
              variant="destructive"
              onClick={handleCancel}
              disabled={cancelling || activeJob.cancelRequested}
              className="w-full text-caption1"
            >
              {cancelling || activeJob.cancelRequested ? "正在取消…" : "取消当前任务"}
            </Button>
          ) : integrations.intervals_icu?.status === "connected" && onTriggerSync ? (
            <Button
              size="xs"
              variant="secondary"
              onClick={() => onTriggerSync("intervals_icu")}
              disabled={isSyncing}
              className="w-full text-caption1"
            >
              {isSyncing ? "同步中…" : "增量同步"}
            </Button>
          ) : (
            <span className="text-caption1 text-text-muted">
              {integrations.intervals_icu?.status === "connected"
                ? "在下方数据源卡片发起同步"
                : "连接后可自动或手动同步"}
            </span>
          )}
        </div>
      </div>
    </div>
  );
}
