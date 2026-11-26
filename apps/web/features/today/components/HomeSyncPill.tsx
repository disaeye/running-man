"use client";

import Link from "next/link";
import { AlertCircle, CheckCircle2, Link2Off, RefreshCw } from "lucide-react";
import type { SyncJob } from "@features/data/hooks/useSyncJobs";
import type { ConnectionState } from "@features/today/lib/freshness-caption";

const PHASE_LABEL: Record<SyncJob["phase"], string> = {
  activities: "活动导入",
  streams: "轨迹流",
  wellness: "健康数据",
  weather: "天气",
};

export function jobProgressNote(job: SyncJob): string {
  const phase = PHASE_LABEL[job.phase] ?? job.phase;
  const windows = job.windowsTotal > 0 ? ` · 窗口 ${job.windowsDone}/${job.windowsTotal}` : "";
  return `同步中 · ${phase}${windows}`;
}

/**
 * 页头紧凑同步状态胶囊：正常连接时仅显示状态点、数据截止日与同步动作；
 * 断连或读取异常时保留明确警示并给出数据源检查入口。
 */
export function HomeSyncPill({
  connection,
  caption,
  lastSync,
  syncing,
  onSync,
}: {
  connection: ConnectionState;
  caption: string;
  lastSync: string | null;
  syncing: boolean;
  onSync: () => void;
}) {
  const Icon = connection === "error" ? AlertCircle : connection === "disconnected" ? Link2Off : CheckCircle2;
  const isAlert = connection === "error" || connection === "disconnected";
  const iconClass = connection === "error" ? "text-error" : connection === "disconnected" ? "text-warn" : "text-accent-strong";
  const borderClass = connection === "error"
    ? "border-error/40"
    : connection === "disconnected"
      ? "border-warn/40"
      : "border-border-subtle";
  const syncTitle = lastSync
    ? `Intervals.icu · 最近同步 ${new Date(lastSync).toLocaleString("zh-CN", { month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit" })}`
    : "Intervals.icu";

  return (
    <div
      title={syncTitle}
      className={`tactile inline-flex max-w-full items-center gap-1.5 rounded-full border bg-surface-overlay pl-3 pr-1 text-caption1 ${borderClass}`}
    >
      <span className="flex min-w-0 items-center gap-1.5 truncate text-text-secondary">
        <span className={`inline-flex shrink-0 items-center justify-center rounded-full ${connection === "connected" && !syncing ? "pulse-dot" : ""}`}>
          <Icon className={`h-3.5 w-3.5 shrink-0 ${iconClass}`} aria-hidden="true" />
        </span>
        <span className="truncate">{isAlert ? `Intervals.icu · ${caption}` : caption}</span>
      </span>
      {isAlert ? (
        <Link
          href="/settings?section=data"
          className="focus-ring tactile inline-flex min-h-11 min-w-11 shrink-0 items-center justify-center rounded-full px-2.5 font-medium text-text-primary hover:bg-surface-active"
        >
          检查数据源
        </Link>
      ) : (
        <button
          type="button"
          onClick={onSync}
          disabled={syncing || connection !== "connected"}
          aria-label={syncing ? "正在同步数据" : "立即同步数据"}
          className={`focus-ring tactile inline-flex min-h-11 min-w-11 shrink-0 items-center justify-center rounded-full px-2.5 font-medium text-text-primary hover:bg-surface-active disabled:opacity-60 ${syncing ? "action-busy" : ""}`}
        >
          <RefreshCw className="h-3.5 w-3.5" aria-hidden="true" />
        </button>
      )}
    </div>
  );
}
