"use client";

interface SyncResult {
  upserted: number;
  deduplicated: number;
  total_processed: number;
}

export function LastSyncDetailBlock({
  detail,
  connected,
}: {
  detail: Record<string, unknown> | null;
  connected: boolean;
}) {
  if (!detail || !connected) return null;
  const counts = detail.counts as Record<string, number> | undefined;
  const errors = detail.errors as unknown[] | undefined;
  const durationMs = detail.duration_ms;
  if (durationMs == null && !counts) return null;
  return (
    <div className="mt-2 rounded-md bg-surface-overlay px-3 py-2 text-caption1 text-text-secondary">
      <div className="flex flex-wrap gap-x-4 gap-y-1">
        <span>新增/更新 {counts?.activities_upserted ?? 0} 条</span>
        <span>去重 {counts?.activities_deduped ?? 0} 条</span>
        {typeof durationMs === "number" ? (
          <span>耗时 {(durationMs / 1000).toFixed(1)}s</span>
        ) : null}
      </div>
      {errors != null && errors.length > 0 && (
        <p className="mt-1 text-error">{errors.length} 个错误</p>
      )}
    </div>
  );
}

import type { SyncJob } from "@features/data/hooks/useSyncJobs";

const PHASE_TEXT: Record<string, string> = {
  activities: "拉取活动记录",
  streams: "解析轨迹与心率流",
  wellness: "同步健康日志",
  weather: "补充天气记录",
};

export function SyncProgressBanner({ active, job }: { active: boolean; job?: SyncJob | null }) {
  if (!active) return null;
  const phase = job?.phase ? (PHASE_TEXT[job.phase] ?? job.phase) : null;
  const windowText =
    job && job.windowsTotal > 0 ? ` · 窗口 ${job.windowsDone}/${job.windowsTotal}` : "";
  const countText = job ? ` · 已新增 ${job.activitiesUpserted} / 流 ${job.streamsInserted}` : "";
  return (
    <div className="mt-2 rounded-md border border-accent/30 bg-accent/10 px-3 py-2 text-caption1 text-accent-strong">
      {phase
        ? `同步进行中：${phase}${windowText}${countText}`
        : "正在从 Intervals.icu 拉取活动与健康数据… 请稍候，完成后会自动刷新。"}
    </div>
  );
}

export function SyncErrorLine({ message }: { message: string | null | undefined }) {
  if (!message) return null;
  return <p className="mt-2 text-caption1 text-error">{message}</p>;
}

export function SyncResultBlock({ result }: { result: SyncResult | null }) {
  if (!result) return null;
  return (
    <div className="mt-2 animate-in fade-in rounded-md bg-success/10 px-3 py-2 text-caption1 text-success">
      同步结果：新增/更新 {result.upserted} 条，去重 {result.deduplicated} 条，共处理{" "}
      {result.total_processed} 条
    </div>
  );
}

export type { SyncResult };
