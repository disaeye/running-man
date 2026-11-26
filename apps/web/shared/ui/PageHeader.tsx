"use client";

import type { ReactNode } from "react";
import { ChevronLeft } from "lucide-react";

export interface PageHeaderProps {
  /** The page's only `<h1>`. */
  title: ReactNode;
  /** One caption line above the title: the period, range or day it covers. */
  meta?: ReactNode;
  description?: ReactNode;
  action?: ReactNode;
  back?: boolean;
  onBack?: () => void;
  /** Content that opens the page under the title row, e.g. a reading strip. */
  children?: ReactNode;
  className?: string;
}

/**
 * The opening block of every dashboard page.
 *
 * On a phone the title, the meta line and the controls stack in reading order
 * and the controls take the full width, so a page never ends its header with
 * controls floating at the right edge of a wrapped row. From `sm` up the title
 * and the controls share one row, controls right-aligned.
 */
export function PageHeader({
  title,
  meta,
  description,
  action,
  back = false,
  onBack,
  children,
  className = "",
}: PageHeaderProps) {
  return (
    <header className={`space-y-2 ${className}`.trim()}>
      {meta ? <p className="text-caption1 text-text-muted">{meta}</p> : null}
      <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-start sm:justify-between">
        <div className="flex min-w-0 flex-1 items-start gap-1 max-sm:w-full">
          {back ? (
            <button type="button" onClick={onBack} aria-label="返回" className="focus-ring tactile -ml-1 flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-text-muted hover:bg-surface-active">
              <ChevronLeft className="h-5 w-5" />
            </button>
          ) : null}
          <h1
            data-page-title
            className="min-w-0 break-words text-title1 font-semibold leading-tight tracking-tight text-text-primary sm:text-display-sm"
          >
            {title}
          </h1>
          {description ? (
            <p className="text-body leading-relaxed text-text-secondary">{description}</p>
          ) : null}
        </div>
        {action ? (
          <div className="flex w-full flex-wrap items-center justify-end gap-2 sm:w-auto sm:flex-nowrap">
            {action}
          </div>
        ) : null}
      </div>
      {children ? <div className="pt-1">{children}</div> : null}
    </header>
  );
}

/**
 * 标准驾驶舱页面容器原语：统一顶栏标题/眉标/返回与右侧操作槽。
 */
export function Page({
  title,
  eyebrow,
  right,
  back,
  onBack,
  children,
}: {
  title: string;
  eyebrow?: ReactNode;
  right?: ReactNode;
  back?: boolean;
  onBack?: () => void;
  children: ReactNode;
}) {
  return (
    <div className="page-stack">
      <PageHeader title={title} meta={eyebrow} action={right} back={back} onBack={onBack} className="mb-2 border-b border-border-subtle pb-3" />
      <div className="space-y-4">{children}</div>
    </div>
  );
}
