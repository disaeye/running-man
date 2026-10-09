"use client";

import { useMemo } from "react";
import { Badge } from "@shared/ui/Badge";
import { Button } from "@shared/ui/button";
import { formatRelativeTime } from "@shared/lib/format";
import type { IntegrationStatus } from "@features/data/hooks/useIntegrations";
import { useSyncRuns } from "@features/data/hooks/useSyncRuns";

interface SyncStatusOverviewProps {
  integrations: { intervals_icu: IntegrationStatus | null };
  onTriggerSync?: (source: "intervals_icu") => void;
  syncingSource?: string | null;
}

export function SyncStatusOverview({
  integrations,
  onTriggerSync,
  syncingSource,
}: SyncStatusOverviewProps) {
  const { data: runs } = useSyncRuns({ limit: 10 });

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
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
      {/* Connected Sources Status */}
      <div className="p-4 rounded-2xl border border-border-default bg-surface-card shadow-xs flex flex-col justify-between">
        <div>
          <span className="text-caption1 font-medium uppercase tracking-wider text-text-muted">
            数据源连接状态
          </span>
          <div className="mt-2 flex items-baseline gap-2">
            <span className="text-title1 font-bold text-text-primary">
              {stats.connectedCount}
            </span>
            <span className="text-caption1 text-text-muted">/ 2 个已连接</span>
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
      <div className="p-4 rounded-2xl border border-border-default bg-surface-card shadow-xs flex flex-col justify-between">
        <div>
          <span className="text-caption1 font-medium uppercase tracking-wider text-text-muted">
            最近一次同步
          </span>
          <div className="mt-2 flex items-center justify-between">
            <span className="text-headline font-bold text-text-primary truncate">
              {stats.latestRun?.started_at
                ? formatRelativeTime(stats.latestRun.started_at)
                : "未执行"}
            </span>
            {stats.latestRun && (
              <Badge
                variant={
                  stats.latestRun.status === "success"
                    ? "success"
                    : stats.latestRun.status === "running"
                      ? "info"
                      : "error"
                }
              >
                {stats.latestRun.status === "success"
                  ? "成功"
                  : stats.latestRun.status === "running"
                    ? "同步中"
                    : "失败"}
              </Badge>
            )}
          </div>
        </div>
        <div className="mt-3 text-caption1 text-text-muted truncate">
          {stats.latestRun
            ? `来源: ${stats.latestRun.source === "intervals_icu" ? "Intervals" : stats.latestRun.source} · 新增 +${stats.latestRun.activities_upserted} 条`
            : "暂无同步流水"}
        </div>
      </div>

      {/* Synchronized Volume stats */}
      <div className="p-4 rounded-2xl border border-border-default bg-surface-card shadow-xs flex flex-col justify-between">
        <div>
          <span className="text-caption1 font-medium uppercase tracking-wider text-text-muted">
            近期入库与流数据
          </span>
          <div className="mt-2 flex items-baseline gap-2">
            <span className="text-title1 font-bold text-accent-strong tabular-nums">
              +{stats.totalUpserted}
            </span>
            <span className="text-caption1 text-text-muted">条活动更新</span>
          </div>
        </div>
        <div className="mt-3 text-caption1 text-text-muted">
          已解析写入{" "}
          <span className="font-semibold text-text-secondary tabular-nums">
            {stats.totalStreams}
          </span>{" "}
          条高频秒级时序流
        </div>
      </div>

      {/* Sync Health & Quick Action */}
      <div className="p-4 rounded-2xl border border-border-default bg-surface-card shadow-xs flex flex-col justify-between">
        <div>
          <span className="text-caption1 font-medium uppercase tracking-wider text-text-muted">
            同步稳定性与健康
          </span>
          <div className="mt-2 flex items-center justify-between">
            <span className="text-headline font-bold text-text-primary">
              {stats.failedRuns > 0 ? (
                <span className="text-error">{stats.failedRuns} 次异常</span>
              ) : (
                <span className="text-success">运行正常</span>
              )}
            </span>
            <Badge variant={stats.failedRuns > 0 ? "warning" : "success"}>
              {stats.successfulRuns}/{runs.length} 成功率
            </Badge>
          </div>
        </div>
        <div className="mt-3 flex items-center gap-2">
          {integrations.intervals_icu?.status === "connected" && onTriggerSync && (
            <Button
              size="xs"
              variant="secondary"
              onClick={() => onTriggerSync("intervals_icu")}
              disabled={syncingSource === "intervals_icu"}
              className="w-full text-caption2"
            >
              {syncingSource === "intervals_icu"
                ? "同步中…"
                : "立即全量/增量同步"}
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}
