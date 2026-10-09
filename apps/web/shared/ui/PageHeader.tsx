import { type ReactNode } from "react";

export interface PageHeaderProps {
  /**
   * Page-level title rendered as a `<h1>`. Optional because the AppShell already
   * owns the canonical page title (via `getPageCopy`); pages that need only an
   * action slot should omit this to avoid a duplicate heading.
   */
  title?: ReactNode;
  description?: ReactNode;
  action?: ReactNode;
  className?: string;
}

export function PageHeader({
  title,
  description,
  action,
  className = "",
}: PageHeaderProps) {
  return (
    <header
      className={`flex flex-wrap items-start justify-between gap-3 ${className}`}
    >
      {title || description ? (
        <div className="min-w-0 flex-1">
          {title ? (
            <h1 className="text-title1 font-bold text-text-primary">{title}</h1>
          ) : null}
          {description ? (
            <div className="mt-1 text-subheadline text-text-secondary">
              {description}
            </div>
          ) : null}
        </div>
      ) : null}
      {action ? (
        <div className="flex max-w-full shrink-0 flex-wrap items-center gap-2">
          {action}
        </div>
      ) : null}
    </header>
  );
}
