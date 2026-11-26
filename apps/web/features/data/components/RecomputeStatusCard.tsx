"use client";

import { Badge } from "@shared/ui/Badge";
import { useRecomputeStatus } from "@features/data/hooks/useRecomputeStatus";

const STATUS_LABELS: Record<string, string> = {
  pending: "等待计算",
  running: "正在计算",
  failed: "计算失败，稍后重试",
  succeeded: "计算完成",
};

export function RecomputeStatusCard() {
  const { status, finishedAt, lastError, error, reload } = useRecomputeStatus();
  if (!status) return null;

  return (
    <section
      className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-border-subtle bg-surface-card px-4 py-3"
      aria-label="训练数据计算状态"
      data-testid="recompute-status"
    >
      <div className="flex items-center gap-2">
        <Badge variant={status === "failed" ? "warning" : status === "succeeded" ? "success" : "info"}>
          {STATUS_LABELS[status] ?? status}
        </Badge>
        {status === "failed" && (
          <span className="text-caption1 text-text-secondary">
            部分训练指标尚未更新，当前仍展示已有记录。前往「我的 → 设置 → 数据源与同步」重新计算。
            {finishedAt ? ` 上次检查：${new Date(finishedAt).toLocaleString("zh-CN")}` : ""}
          </span>
        )}
        {lastError ? <span className="sr-only">计算状态技术详情：{lastError}</span> : null}
        {error && <span className="text-caption1 text-error">暂时无法读取指标计算状态，请稍后刷新。</span>}
      </div>
      {status === "failed" && (
        <button
          type="button"
          onClick={reload}
          className="focus-ring min-h-11 rounded-md px-3 text-caption1 font-medium text-accent-strong hover:bg-surface-overlay"
        >
          刷新状态
        </button>
      )}
    </section>
  );
}
