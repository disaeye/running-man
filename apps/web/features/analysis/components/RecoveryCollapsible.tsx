"use client";

import { useState, type ReactNode } from "react";
import { ChevronDown, ChevronUp } from "lucide-react";

type RecoveryCollapsibleProps = {
  readonly children: ReactNode;
};

/**
 * Browse/Analysis density: recovery charts stay off the first fold of 负荷.
 */
export function RecoveryCollapsible({ children }: RecoveryCollapsibleProps) {
  const [open, setOpen] = useState(false);

  return (
    <div data-testid="recovery-collapsible">
      <button
        type="button"
        className="focus-ring flex w-full min-h-[44px] items-center justify-between gap-3 rounded-2xl border border-border-subtle bg-[var(--glass-bg)] px-4 py-3 text-left transition-colors hover:bg-surface-overlay/60"
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
        data-testid="recovery-collapsible-toggle"
      >
        <div>
          <span className="block text-title3 font-semibold text-text-primary">
            恢复趋势
          </span>
          <span className="mt-0.5 block text-caption1 text-text-muted">
            睡眠 · 静息心率 · VO₂max · 负荷相关
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
