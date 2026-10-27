import { type ReactNode } from "react";

export interface PageHeaderProps {
  /** The page's only `<h1>`. */
  title: ReactNode;
  /** One caption line above the title: the period, range or day it covers. */
  meta?: ReactNode;
  description?: ReactNode;
  action?: ReactNode;
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
  children,
  className = "",
}: PageHeaderProps) {
  return (
    <header className={`space-y-2 ${className}`.trim()}>
      {meta ? <p className="text-caption1 text-text-muted">{meta}</p> : null}
      <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-start sm:justify-between">
        <div className="min-w-0 space-y-2">
          <h1
            data-page-title
            className="whitespace-nowrap text-title1 font-semibold tracking-tight text-text-primary sm:text-display-sm"
          >
            {title}
          </h1>
          {description ? (
            <p className="text-body leading-relaxed text-text-secondary">{description}</p>
          ) : null}
        </div>
        {action ? (
          <div className="flex w-full flex-wrap items-center gap-2 sm:w-auto sm:flex-nowrap sm:justify-end">
            {action}
          </div>
        ) : null}
      </div>
      {children ? <div className="pt-1">{children}</div> : null}
    </header>
  );
}
