"use client";

/**
 * Unified data display shell. Wraps a value (or absence of one) with a
 * consistent header showing data source, freshness, and field coverage.
 * Seven states match `useDataState` plus the two domain-specific ones
 * (`field-missing`, `needs-action`).
 *
 * `source` semantics: `undefined` → no badge (derived data); `null` →
 * renders "计算自活动数据"; string → renders verbatim (e.g. "健康数据").
 */

import Link from "next/link";
import { type ReactNode } from "react";
import { Skeleton } from "@shared/ui/Skeleton";
import { cn } from "@shared/lib/utils";
import { formatRelativeTime } from "@shared/lib/format";
import type { DataStateType } from "@shared/lib/use-data-state";

export interface DataStateCompleteness {
  with_hr?: number;
  with_gps?: number;
  total?: number;
}

export interface DataStateProps {
  state: DataStateType;
  /** Dataset source. Omit for derived datasets; null for "not configured". */
  source?: string | null;
  /** ISO timestamp of when the underlying data was produced. */
  dataAsOf?: string | null;
  /** Field coverage for `with_hr` / `with_gps` / `total`. */
  completeness?: DataStateCompleteness | null;
  /** Optional drill-down destination for error / empty / stale prompts. */
  drillDownHref?: string;
  /** Rendered when `state === "ready"`. */
  children?: ReactNode;
  emptyTitle?: string;
  emptyAction?: string;
  errorTitle?: string;
  staleTitle?: string;
  className?: string;
}

const SOURCE_LABEL_DERIVED = "计算自活动数据";

function FreshnessBadge({ dataAsOf }: { dataAsOf: string }) {
  return (
    <span
      data-testid="freshness-badge"
      data-freshness={dataAsOf}
      className="inline-flex items-center rounded-full border border-border-default bg-surface-card px-2 py-0.5 text-caption1 text-text-muted"
    >
      更新 {formatRelativeTime(dataAsOf)}
    </span>
  );
}

function CompletenessHint({ completeness }: { completeness: DataStateCompleteness }) {
  const total = typeof completeness.total === "number" ? completeness.total : 0;
  if (total <= 0) return null;
  const parts: string[] = [];
  if (typeof completeness.with_hr === "number") parts.push(`HR ${completeness.with_hr}/${total}`);
  if (typeof completeness.with_gps === "number") parts.push(`GPS ${completeness.with_gps}/${total}`);
  if (parts.length === 0) return null;
  return (
    <span
      data-testid="completeness-hint"
      className="inline-flex items-center rounded-full border border-border-default bg-surface-card px-2 py-0.5 text-caption1 text-text-muted"
    >
      覆盖 {parts.join(" · ")}
    </span>
  );
}

function SourceBadge({ source }: { source: string | null | undefined }) {
  if (source === undefined) return null;
  const isDerived = source === null;
  const variantClass = isDerived
    ? "border-info/30 bg-info/10 text-info"
    : "border-border-default bg-surface-card text-text-secondary";
  return (
    <span
      data-testid="source-badge"
      data-source={isDerived ? "derived" : source}
      className={cn(
        "inline-flex items-center rounded-full border px-2 py-0.5 text-caption2",
        variantClass,
      )}
    >
      {isDerived ? SOURCE_LABEL_DERIVED : source}
    </span>
  );
}

function DrillDownLink({ href, label }: { href: string; label: string }) {
  return (
    <Link
      href={href}
      data-testid="data-state-drill-down"
      className="mt-2 inline-flex items-center gap-1 text-caption1 font-medium text-accent-strong hover:underline"
    >
      {label}
    </Link>
  );
}

function Panel({
  title, hint, href, hrefLabel, titleClassName, badge,
}: {
  title: ReactNode;
  hint?: string;
  href?: string;
  hrefLabel?: string;
  titleClassName?: string;
  badge?: boolean;
}) {
  return (
    <div className="flex flex-col">
      {badge ? (
        <span className="inline-flex w-fit items-center rounded-full border border-warning/30 bg-warning/10 px-2 py-0.5 text-caption2 text-warning">
          {title}
        </span>
      ) : (
        <span className={cn("text-subheadline font-medium", titleClassName ?? "text-text-secondary")}>
          {title}
        </span>
      )}
      {hint && <span className="mt-0.5 text-caption1 text-text-muted">{hint}</span>}
      {href && hrefLabel && <DrillDownLink href={href} label={hrefLabel} />}
    </div>
  );
}

function LoadingState() {
  return (
    <div className="flex flex-col gap-1.5">
      <Skeleton className="h-3 w-24" />
      <Skeleton className="h-6 w-32" />
    </div>
  );
}

function assertNever(value: never): never {
  throw new Error(`Unexpected data state: ${JSON.stringify(value)}`);
}

function StateBody({
  state, emptyTitle, emptyAction, errorTitle, staleTitle, drillDownHref, children,
}: {
  state: DataStateType;
  emptyTitle: string;
  emptyAction: string;
  errorTitle: string;
  staleTitle: string;
  drillDownHref?: string;
  children?: ReactNode;
}) {
  switch (state) {
    case "loading":
      return <LoadingState />;
    case "source-error":
      return <Panel title={errorTitle} titleClassName="text-error" hint="请稍后重试或检查数据源" href={drillDownHref} hrefLabel="检查数据源" />;
    case "source-empty":
      return <Panel title={emptyTitle} hint="接入数据后将在此显示" href={drillDownHref} hrefLabel={emptyAction} />;
    case "field-missing":
      return <Panel title="字段缺失" badge hint="该字段暂无数值" href={drillDownHref} hrefLabel="查看数据源" />;
    case "stale":
      return <Panel title={staleTitle} badge hint="请重新同步获取最新数据" href={drillDownHref} hrefLabel="重新同步" />;
    case "needs-action":
      return <Panel title="需要操作" titleClassName="text-info" hint="完成下方步骤以解锁数据" href={drillDownHref} hrefLabel="去处理" />;
    case "ready":
      return <>{children}</>;
    default:
      return assertNever(state);
  }
}

export function DataState({
  state, source, dataAsOf, completeness, drillDownHref, children,
  emptyTitle = "尚未接入数据", emptyAction = "前往数据",
  errorTitle = "数据读取失败", staleTitle = "数据已过期", className,
}: DataStateProps) {
  return (
    <div data-testid="data-state" data-state={state} className={cn("flex flex-col gap-2", className)}>
      <div className="flex flex-wrap items-center gap-1.5">
        {source !== undefined && <SourceBadge source={source} />}
        {dataAsOf && <FreshnessBadge dataAsOf={dataAsOf} />}
        {completeness && <CompletenessHint completeness={completeness} />}
      </div>
      <StateBody
        state={state} emptyTitle={emptyTitle} emptyAction={emptyAction}
        errorTitle={errorTitle} staleTitle={staleTitle} drillDownHref={drillDownHref}
      >
        {children}
      </StateBody>
    </div>
  );
}
