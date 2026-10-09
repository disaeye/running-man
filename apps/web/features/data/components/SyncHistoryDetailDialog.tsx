"use client";

import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@shared/ui/dialog";
import { Badge } from "@shared/ui/Badge";
import { Button } from "@shared/ui/button";
import type { SyncRunRow } from "../hooks/useSyncRuns";
import { formatRelativeTime } from "@shared/lib/format";

interface SyncHistoryDetailDialogProps {
  run: SyncRunRow | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

const SOURCE_LABELS: Record<string, string> = {
  intervals_icu: "Intervals.icu",
  garmin: "Garmin",
  file_upload: "文件导入",
};

const TRIGGER_LABELS: Record<string, string> = {
  manual: "手动同步",
  auto: "定时自动同步",
  webhook: "实时推送",
  connect: "首次连接导入",
  reconcile: "对账修复",
};

function formatDate(value: string | null): string {
  if (!value) return "无";
  try {
    return new Date(value).toLocaleString("zh-CN", {
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
    });
  } catch {
    return value;
  }
}

function calculateDuration(start: string | null, finish: string | null): string {
  if (!start) return "-";
  const startTime = new Date(start).getTime();
  const finishTime = finish ? new Date(finish).getTime() : Date.now();
  const diffMs = Math.max(0, finishTime - startTime);
  if (diffMs < 1000) return `${diffMs} 毫秒`;
  const seconds = (diffMs / 1000).toFixed(1);
  if (diffMs < 60000) return `${seconds} 秒`;
  const minutes = Math.floor(diffMs / 60000);
  const remSec = Math.floor((diffMs % 60000) / 1000);
  return `${minutes} 分 ${remSec} 秒`;
}

export function SyncHistoryDetailDialog({
  run,
  open,
  onOpenChange,
}: SyncHistoryDetailDialogProps) {
  if (!run) return null;

  const statusVariant =
    run.status === "success"
      ? "success"
      : run.status === "partial"
        ? "warning"
        : run.status === "running"
          ? "info"
          : "error";

  const statusLabel =
    run.status === "success"
      ? "同步成功"
      : run.status === "partial"
        ? "部分成功"
        : run.status === "running"
          ? "同步进行中"
          : "同步失败";

  const detailObj =
    typeof run.detail === "object" && run.detail !== null
      ? (run.detail as Record<string, unknown>)
      : null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <div className="flex items-center justify-between gap-4 pr-6">
            <div className="flex items-center gap-2.5">
              <DialogTitle className="text-title3 font-bold text-text-primary">
                同步详情记录
              </DialogTitle>
              <Badge variant={statusVariant}>{statusLabel}</Badge>
            </div>
            <span className="text-caption1 text-text-muted">
              {formatRelativeTime(run.started_at || "")}
            </span>
          </div>
        </DialogHeader>

        <div className="space-y-6 pt-2">
          {/* Metadata Grid */}
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 p-4 rounded-xl bg-surface-sunken/60 border border-border-default text-caption1">
            <div>
              <span className="text-text-muted block mb-1">数据源</span>
              <span className="font-medium text-text-primary">
                {SOURCE_LABELS[run.source] ?? run.source}
              </span>
            </div>
            <div>
              <span className="text-text-muted block mb-1">触发方式</span>
              <span className="font-medium text-text-primary">
                {TRIGGER_LABELS[run.trigger] ?? run.trigger}
              </span>
            </div>
            <div>
              <span className="text-text-muted block mb-1">耗时</span>
              <span className="font-medium text-text-primary">
                {calculateDuration(run.started_at, run.finished_at)}
              </span>
            </div>
            <div>
              <span className="text-text-muted block mb-1">开始时间</span>
              <span className="font-medium text-text-primary">{formatDate(run.started_at)}</span>
            </div>
            <div>
              <span className="text-text-muted block mb-1">结束时间</span>
              <span className="font-medium text-text-primary">{formatDate(run.finished_at)}</span>
            </div>
            <div>
              <span className="text-text-muted block mb-1">同步时间窗口</span>
              <span className="font-medium text-text-primary truncate block">
                {run.window_start || run.window_end
                  ? `${run.window_start?.split("T")[0] ?? "最早"} ~ ${run.window_end?.split("T")[0] ?? "至今"}`
                  : "全量 / 增量默认"}
              </span>
            </div>
          </div>

          {/* Sync Metrics Counts */}
          <div>
            <h4 className="text-subheadline font-semibold text-text-primary mb-3 flex items-center gap-2">数据同步统计</h4>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              <div className="p-3 rounded-xl border border-border-default bg-surface-card text-center">
                <span className="text-caption1 text-text-muted block mb-1">扫描活动数</span>
                <span className="text-title3 font-bold tabular-nums text-text-primary">
                  {run.activities_seen}
                </span>
              </div>
              <div className="p-3 rounded-xl border border-border-default bg-surface-card text-center">
                <span className="text-caption1 text-text-muted block mb-1">新增 / 更新</span>
                <span className="text-title3 font-bold tabular-nums text-accent-strong">
                  {run.activities_upserted}
                </span>
              </div>
              <div className="p-3 rounded-xl border border-border-default bg-surface-card text-center">
                <span className="text-caption1 text-text-muted block mb-1">已存在去重</span>
                <span className="text-title3 font-bold tabular-nums text-text-secondary">
                  {run.activities_deduplicated}
                </span>
              </div>
              <div className="p-3 rounded-xl border border-border-default bg-surface-card text-center">
                <span className="text-caption1 text-text-muted block mb-1">时序流 (Streams)</span>
                <span className="text-title3 font-bold tabular-nums text-text-primary">
                  {run.streams_inserted}
                </span>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3 mt-3">
              <div className="p-3 rounded-xl border border-border-default bg-surface-card flex items-center justify-between">
                <span className="text-caption1 text-text-secondary">健康日志 (Wellness)</span>
                <span className="text-subheadline font-semibold tabular-nums text-text-primary">
                  {run.wellness_seen} 天
                </span>
              </div>
              <div className="p-3 rounded-xl border border-border-default bg-surface-card flex items-center justify-between">
                <span className="text-caption1 text-text-secondary">异常与错误数</span>
                <span
                  className={`text-subheadline font-semibold tabular-nums ${
                    run.errors_count > 0 ? "text-error" : "text-text-muted"
                  }`}
                >
                  {run.errors_count} 个
                </span>
              </div>
            </div>
          </div>

          {/* Error Summary if failed */}
          {run.error_summary && (
            <div className="p-4 rounded-xl border border-error/30 bg-error/10 space-y-1.5">
              <div className="text-caption1 font-semibold text-error flex items-center gap-1.5">
                <svg
                  className="w-4 h-4"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
                  />
                </svg>
                <span>错误摘要 / 异常信息</span>
              </div>
              <p className="text-caption1 text-error whitespace-pre-wrap font-mono break-all">
                {run.error_summary}
              </p>
            </div>
          )}

          {/* Detailed JSON Payload if available */}
          {detailObj && Object.keys(detailObj).length > 0 && (
            <div>
              <h4 className="text-subheadline font-semibold text-text-primary mb-2">
                深度元数据与诊断信息 (Detail)
              </h4>
              <div className="p-3 rounded-xl bg-surface-sunken border border-border-default max-h-60 overflow-y-auto">
                <pre className="text-caption2 font-mono text-text-secondary whitespace-pre-wrap break-all">
                  {JSON.stringify(detailObj, null, 2)}
                </pre>
              </div>
            </div>
          )}

          <div className="flex justify-end pt-2">
            <Button variant="secondary" onClick={() => onOpenChange(false)}>
              关闭
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
