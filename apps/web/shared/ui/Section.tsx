"use client";

import Link from "next/link";
import { ChevronRight } from "lucide-react";
import type { ReactNode } from "react";

/**
 * The page content system: every dashboard screen is a stack of Sections.
 *
 * One section is a small label above one surface. Inside that surface there is
 * exactly one of three things — rows (one fact each), numbers (a stat grid) or a
 * chart — so two screens built from these pieces look like one app instead of
 * two apps' worth of cards. Sections never nest.
 */

export function Section({
  title,
  action,
  children,
  className = "",
  testId,
}: {
  readonly title?: ReactNode;
  readonly action?: ReactNode;
  readonly children: ReactNode;
  readonly className?: string;
  readonly testId?: string;
}) {
  return (
    <section className={`space-y-2 ${className}`.trim()} data-testid={testId}>
      {title ? (
        <div className="flex min-h-5 items-baseline justify-between gap-3 px-1">
          <h2 className="text-caption1 font-semibold text-text-secondary">{title}</h2>
          {action}
        </div>
      ) : null}
      <div className="divide-y divide-border-subtle overflow-hidden rounded-2xl bg-surface-card">
        {children}
      </div>
    </section>
  );
}

/** Chart body: one height everywhere, one inset everywhere. */
export function SectionChart({ children }: { readonly children: ReactNode }) {
  return <div className="h-56 px-2 py-3 sm:h-64">{children}</div>;
}

const COLUMNS = {
  2: "grid-cols-2",
  3: "grid-cols-3",
  4: "grid-cols-2 sm:grid-cols-4",
} as const;

/**
 * A section's numbers. Peers only: cells that answer one question together.
 *
 * Values are the largest type on a screen, so they belong here and nowhere
 * else; a single number with an explanation is a Row.
 */
export function StatGrid({
  cols = 4,
  children,
  testId,
}: {
  readonly cols?: 2 | 3 | 4;
  readonly children: ReactNode;
  readonly testId?: string;
}) {
  return (
    <div
      className={`grid gap-px overflow-hidden rounded-2xl bg-border-subtle ${COLUMNS[cols]}`}
      data-testid={testId}
    >
      {children}
    </div>
  );
}

export function Stat({
  label,
  value,
  unit,
  note,
  tone = "default",
}: {
  readonly label: ReactNode;
  readonly value: ReactNode;
  readonly unit?: ReactNode;
  readonly note?: ReactNode;
  readonly tone?: "default" | "attention";
}) {
  return (
    <div className="min-w-0 bg-surface-card px-2 py-3 text-center">
      <div
        className={`flex items-baseline justify-center gap-0.5 font-mono text-title2 font-semibold tabular-nums ${
          tone === "attention" ? "text-warning" : "text-text-primary"
        }`}
      >
        <span className="truncate">{value}</span>
        {unit ? <span className="text-caption1 font-normal text-text-muted">{unit}</span> : null}
      </div>
      <div className="mt-0.5 truncate text-caption1 font-medium text-text-secondary">{label}</div>
      {note ? <div className="mt-0.5 truncate text-caption1 text-text-muted">{note}</div> : null}
    </div>
  );
}

interface RowProps {
  readonly label: ReactNode;
  readonly detail?: ReactNode;
  readonly value?: ReactNode;
  readonly unit?: ReactNode;
  readonly trailing?: ReactNode;
  readonly href?: string;
  readonly onClick?: () => void;
  readonly chevron?: boolean;
  readonly testId?: string;
  readonly disabled?: boolean;
}

function RowBody({
  label,
  detail,
  value,
  unit,
  trailing,
  chevron,
}: Omit<RowProps, "href" | "onClick" | "testId" | "disabled">) {
  return (
    <>
      <span className="min-w-0 flex-1">
        <span className="block text-subheadline text-text-primary">{label}</span>
        {detail ? (
          <span className="mt-0.5 block text-caption1 leading-snug text-text-muted">{detail}</span>
        ) : null}
      </span>
      {trailing}
      {value !== undefined ? (
        <span className="flex shrink-0 items-baseline gap-1 font-mono text-subheadline tabular-nums text-text-primary">
          {value}
          {unit ? <span className="text-caption1 text-text-muted">{unit}</span> : null}
        </span>
      ) : null}
      {chevron ? (
        <ChevronRight className="size-4 shrink-0 text-text-muted" aria-hidden="true" />
      ) : null}
    </>
  );
}

const ROW = "row-press flex min-h-14 w-full items-center gap-3 px-5 py-2.5 text-left";

export function Row({ href, onClick, chevron, testId, disabled, ...body }: RowProps) {
  if (href) {
    return (
      <Link
        href={href}
        data-testid={testId}
        className={`${ROW} focus-ring transition-colors hover:bg-surface-overlay`}
      >
        <RowBody {...body} chevron={chevron} />
      </Link>
    );
  }
  if (onClick) {
    return (
      <button
        type="button"
        onClick={onClick}
        data-testid={testId}
        className={`${ROW} focus-ring transition-colors hover:bg-surface-overlay`}
      >
        <RowBody {...body} chevron={chevron} />
      </button>
    );
  }
  return (
    <div data-testid={testId} className={`${ROW} ${disabled ? "opacity-60" : ""}`.trim()}>
      <RowBody {...body} chevron={chevron} />
    </div>
  );
}
