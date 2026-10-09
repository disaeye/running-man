"use client";

import { useState, useMemo } from "react";
import { Card } from "@shared/ui/Card";
import { Badge } from "@shared/ui/Badge";
import { Button } from "@shared/ui/button";
import { useSyncRuns, type SyncRunRow } from "../hooks/useSyncRuns";
import { SyncHistoryDetailDialog } from "./SyncHistoryDetailDialog";
import { formatRelativeTime } from "@shared/lib/format";

type StatusVariant = "success" | "warning" | "error" | "info" | "neutral";

const STATUS_VARIANT: Record<SyncRunRow["status"], StatusVariant> = {
  success: "success",
  partial: "warning",
  failed: "error",
  running: "info",
};

const STATUS_LABEL: Record<SyncRunRow["status"], string> = {
  success: "成功",
  partial: "部分完成",
  failed: "失败",
  running: "同步中",
};

const SOURCE_LABEL: Record<string, string> = {
  intervals_icu: "Intervals.icu",
  garmin: "Garmin",
  file_upload: "文件导入",
};

const TRIGGER_LABEL: Record<string, string> = {
  manual: "手动触发",
  auto: "自动定时",
  webhook: "实时同步",
  connect: "初始连接",
  reconcile: "对账修复",
};

function formatDate(value: string | null): string {
  if (!value) return "-";
  try {
    return new Date(value).toLocaleString("zh-CN", {
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    return value;
  }
}

function formatWindow(start: string | null, end: string | null): string {
  if (!start && !end) return "全量 / 增量默认";
  const s = start?.split("T")[0] ?? "最早";
  const e = end?.split("T")[0] ?? "至今";
  return `${s} ~ ${e}`;
}

export function SyncHistoryList() {
  const [sourceFilter, setSourceFilter] = useState<string>("all");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [selectedRun, setSelectedRun] = useState<SyncRunRow | null>(null);

  const queryParams = useMemo(() => {
    return {
      source: sourceFilter === "all" ? undefined : sourceFilter,
      status: statusFilter === "all" ? undefined : statusFilter,
    };
  }, [sourceFilter, statusFilter]);

  const { data, loading, error, reload } = useSyncRuns(queryParams);

  return (
    <div className="space-y-4">
      {/* Header filter bar */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-2">
          <div className="flex items-center gap-1.5 bg-surface-sunken p-1 rounded-lg border border-border-default text-caption1">
            <span className="text-text-muted px-2">来源:</span>
            {[
              { id: "all", label: "全部" },
              { id: "intervals_icu", label: "Intervals" },
            ].map((tab) => (
              <button
                key={tab.id}
                type="button"
                onClick={() => setSourceFilter(tab.id)}
                className={`px-2.5 py-1 rounded-md text-caption1 transition-colors ${
                  sourceFilter === tab.id
                    ? "bg-surface-card text-text-primary font-medium shadow-xs"
                    : "text-text-secondary hover:text-text-primary"
                }`}
              >
                {tab.label}
              </button>
            ))}
          </div>

          <div className="flex items-center gap-1.5 bg-surface-sunken p-1 rounded-lg border border-border-default text-caption1">
            <span className="text-text-muted px-2">状态:</span>
            {[
              { id: "all", label: "全部" },
              { id: "success", label: "成功" },
              { id: "failed", label: "失败" },
            ].map((tab) => (
              <button
                key={tab.id}
                type="button"
                onClick={() => setStatusFilter(tab.id)}
                className={`px-2.5 py-1 rounded-md text-caption1 transition-colors ${
                  statusFilter === tab.id
                    ? "bg-surface-card text-text-primary font-medium shadow-xs"
                    : "text-text-secondary hover:text-text-primary"
                }`}
              >
                {tab.label}
              </button>
            ))}
          </div>
        </div>

        <Button
          size="sm"
          variant="ghost"
          onClick={() => reload()}
          disabled={loading}
          className="text-caption1 text-text-secondary hover:text-text-primary"
        >
          {loading ? "刷新中..." : "刷新记录"}
        </Button>
      </div>

      {loading && data.length === 0 ? (
        <Card padding="md" className="text-center text-caption1 text-text-muted">
          加载同步记录中...
        </Card>
      ) : error ? (
        <Card padding="md" className="text-center text-caption1 text-error">
          加载记录失败: {error}
        </Card>
      ) : data.length === 0 ? (
        <Card padding="lg" className="text-center text-caption1 text-text-muted py-10">
          <div className="space-y-2"><p className="font-medium text-text-secondary">暂无符合条件的同步记录</p><p className="text-caption1 text-text-muted">发起手动同步或连接数据源后，每次同步的详细吞吐和健康数据将在此记录。</p></div>
        </Card>
      ) : (
        <div className="overflow-x-auto rounded-xl border border-border-default bg-surface-card shadow-xs">
          <table className="w-full border-collapse text-left text-caption1">
            <thead>
              <tr className="border-b border-border-default bg-surface-sunken/60 text-text-secondary font-medium">
                <th className="px-4 py-2.5">数据源 / 触发</th>
                <th className="px-4 py-2.5">执行时间</th>
                <th className="px-4 py-2.5">同步窗口</th>
                <th className="px-4 py-2.5">状态</th>
                <th className="px-4 py-2.5 text-right">入库 / 去重</th>
                <th className="px-4 py-2.5 text-right">时序/日志</th>
                <th className="px-4 py-2.5 text-right">操作</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border-default">
              {data.map((row) => {
                return (
                  <tr
                    key={row.id}
                    className="hover:bg-surface-overlay/30 transition-colors group cursor-pointer"
                    onClick={() => setSelectedRun(row)}
                  >
                    <td className="px-4 py-3">
                      <div className="font-medium text-text-primary">
                        {SOURCE_LABEL[row.source] ?? row.source}
                      </div>
                      <div className="text-caption2 text-text-muted">
                        {TRIGGER_LABEL[row.trigger] ?? row.trigger}
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <div className="text-text-primary font-medium">
                        {formatDate(row.started_at)}
                      </div>
                      <div className="text-caption2 text-text-muted">
                        {row.started_at ? formatRelativeTime(row.started_at) : ""}
                      </div>
                    </td>
                    <td className="px-4 py-3 text-text-secondary font-mono text-caption2">
                      {formatWindow(row.window_start, row.window_end)}
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-1.5">
                        <Badge variant={STATUS_VARIANT[row.status] ?? "neutral"}>
                          {STATUS_LABEL[row.status] ?? row.status}
                        </Badge>
                        {row.errors_count > 0 && (
                          <span className="text-caption2 text-error font-medium">
                            ({row.errors_count} 错)
                          </span>
                        )}
                      </div>
                    </td>
                    <td className="px-4 py-3 text-right">
                      <div className="text-text-primary font-medium tabular-nums">
                        +{row.activities_upserted}
                      </div>
                      <div className="text-caption1 text-text-muted tabular-nums">
                        {row.activities_deduplicated} 去重
                      </div>
                    </td>
                    <td className="px-4 py-3 text-right tabular-nums">
                      <div className="text-text-secondary">
                        {row.streams_inserted} 流
                      </div>
                      <div className="text-caption1 text-text-muted">
                        {row.wellness_seen} 日志
                      </div>
                    </td>
                    <td className="px-4 py-3 text-right">
                      <Button
                        size="xs"
                        variant="ghost"
                        onClick={(e) => {
                          e.stopPropagation();
                          setSelectedRun(row);
                        }}
                        className="text-caption1 text-accent-strong hover:bg-accent/10"
                      >
                        详情
                      </Button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* Sync Run Detail Modal */}
      <SyncHistoryDetailDialog
        run={selectedRun}
        open={selectedRun !== null}
        onOpenChange={(open) => {
          if (!open) setSelectedRun(null);
        }}
      />
    </div>
  );
}
