"use client";

import type { ReactNode } from "react";
import { Check, RefreshCw, X } from "lucide-react";
import { DisclosureCard } from "@shared/ui/DisclosureCard";

export interface AvailabilityRow {
  label: string;
  ok: boolean;
}

export function DataAvailabilityCard({
  rows,
  source,
  fileType,
  onRetryStreams,
  retryingStreams = false,
  actions,
}: {
  rows: AvailabilityRow[];
  source: string;
  fileType: string;
  onRetryStreams?: () => void;
  retryingStreams?: boolean;
  actions?: ReactNode;
}) {
  return (
    <DisclosureCard
      title="数据可用性与记录管理"
      testId="data-availability-card"
      alwaysShowSummary
      summary={
        <span className="mt-1 inline-flex flex-wrap gap-1.5">
          {rows.map((m) => (
            <span
              key={m.label}
              className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-caption1 font-medium ${
                m.ok
                  ? "bg-success/12 text-success"
                  : "bg-surface-overlay text-text-muted"
              }`}
              data-testid={`availability-${m.label}`}
              data-state={m.ok ? "available" : "missing"}
            >
              <span aria-hidden>
                {m.ok ? <Check className="h-3 w-3" /> : <X className="h-3 w-3" />}
              </span>
              {m.label}
            </span>
          ))}
        </span>
      }
    >
      <div className="space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-2 text-caption1 text-text-muted">
          <div className="flex flex-wrap items-center gap-2">
            <span>文件与来源：</span>
            {source ? (
              <span className="inline-flex items-center rounded-full bg-surface-overlay px-2.5 py-0.5 text-caption1 text-text-secondary">
                {source}
              </span>
            ) : null}
            {fileType ? (
              <span className="inline-flex items-center rounded-full bg-surface-overlay px-2.5 py-0.5 font-mono text-caption1 uppercase text-text-secondary">
                {fileType}
              </span>
            ) : null}
            {!source && !fileType ? <span>未记录来源信息</span> : null}
          </div>
          {onRetryStreams ? (
            <button
              type="button"
              disabled={retryingStreams}
              onClick={onRetryStreams}
              className="focus-ring tactile inline-flex min-h-11 items-center gap-1.5 rounded-full border border-border-default px-3 text-caption1 font-medium text-accent-strong hover:bg-surface-active disabled:opacity-50"
            >
              <RefreshCw className={`size-3.5 ${retryingStreams ? "animate-spin" : ""}`} aria-hidden="true" />
              {retryingStreams ? "正在拉取…" : "重新拉取运动流"}
            </button>
          ) : null}
        </div>
        {actions ? (
          <div className="flex flex-wrap items-center justify-between gap-3 border-t border-border-subtle pt-3">
            <span className="text-caption1 text-text-muted">管理这条活动记录</span>
            {actions}
          </div>
        ) : null}
      </div>
    </DisclosureCard>
  );
}
