"use client";

import { useState, type ReactNode } from "react";
import { ChevronDown, ChevronUp } from "lucide-react";

type RecoveryCollapsibleProps = {
  readonly children: ReactNode;
};

/**
 * Recovery charts stay collapsed until requested.
 */
export function RecoveryCollapsible({ children }: RecoveryCollapsibleProps) {
  const [open, setOpen] = useState(false);

  return (
    <div data-testid="recovery-collapsible">
      <button
        type="button"
        className="row-press focus-ring flex min-h-11 w-full items-center justify-between gap-3 rounded-2xl bg-surface-card px-4 py-3 text-left hover:bg-surface-overlay"
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
        data-testid="recovery-collapsible-toggle"
      >
        <div>
          <span className="block text-caption1 font-semibold text-text-secondary">
            恢复趋势
          </span>
          <span className="mt-0.5 block text-caption1 text-text-muted">
            睡眠 · 静息心率 · 心率变异 · 最大摄氧量
          </span>
        </div>
        <span className="flex items-center gap-1 text-caption1 text-text-muted">
          {open ? "收起" : "展开"}
          {open ? (
            <ChevronUp className="h-4 w-4" aria-hidden />
          ) : (
            <ChevronDown className="h-4 w-4" aria-hidden />
          )}
        </span>
      </button>
      {open ? <div className="mt-4 flex flex-col gap-4">{children}</div> : null}
    </div>
  );
}
