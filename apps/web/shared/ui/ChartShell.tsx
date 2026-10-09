import { type HTMLAttributes, type ReactNode } from "react";
import { Card } from "./Card";

interface ChartShellProps extends HTMLAttributes<HTMLDivElement> {
  title: string;
  subtitle?: string;
  provenance?: string;
  legend?: ReactNode;
  empty?: boolean;
  emptyMessage?: string;
  children?: ReactNode;
}

export function ChartShell({
  title,
  subtitle,
  provenance,
  legend,
  empty = false,
  emptyMessage = "暂无数据",
  className = "",
  children,
  ...props
}: ChartShellProps) {
  return (
    <Card padding="md" className={className} {...props}>
      <div className="flex items-baseline justify-between gap-3">
        <div className="min-w-0">
          <h3 className="text-title3 font-semibold text-text-primary">
            {title}
          </h3>
          {subtitle && (
            <p className="mt-0.5 text-footnote text-text-muted">{subtitle}</p>
          )}
        </div>
        {legend && <div className="flex shrink-0 items-center gap-3">{legend}</div>}
      </div>

      <div className="mt-4 min-h-[200px]">
        {empty ? (
          <div className="flex h-full min-h-[200px] items-center justify-center">
            <p className="text-body text-text-muted">{emptyMessage}</p>
          </div>
        ) : (
          children
        )}
      </div>

      {provenance && (
        <p className="mt-3 text-caption2 text-text-muted">{provenance}</p>
      )}
    </Card>
  );
}
