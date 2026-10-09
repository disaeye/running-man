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
  const { status, attempts, lastError, error, reload } = useRecomputeStatus();
  if (!status) return null;

  return (
    <section
      className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-border-subtle bg-surface-card px-4 py-3"
      aria-label="训练负荷计算状态"
      data-testid="recompute-status"
    >
      <div className="flex items-center gap-2">
        <Badge variant={status === "failed" ? "warning" : status === "succeeded" ? "success" : "info"}>
          {STATUS_LABELS[status] ?? status}
        </Badge>
        {status === "failed" && attempts > 0 && (
          <span className="text-caption1 text-text-muted">已尝试 {attempts} 次</span>
        )}
        {status === "failed" && lastError && (
          <span className="text-caption1 text-error">{lastError}</span>
        )}
        {error && <span className="text-caption1 text-error">状态读取失败：{error}</span>}
      </div>
      {status === "failed" && (
        <button
          type="button"
          onClick={reload}
          className="focus-ring min-h-10 rounded-md px-3 text-caption1 font-medium text-accent-strong hover:bg-surface-overlay"
        >
          重新检查
        </button>
      )}
    </section>
  );
}
