import { type HTMLAttributes, type ReactNode } from "react";

interface SectionHeaderProps extends Omit<HTMLAttributes<HTMLDivElement>, "title"> {
  title: ReactNode;
  subtitle?: ReactNode;
  action?: ReactNode;
}

export function SectionHeader({
  title,
  subtitle,
  action,
  className = "",
  ...props
}: SectionHeaderProps) {
  return (
    <div
      className={`flex items-baseline justify-between gap-3 ${className}`.trim()}
      {...props}
    >
      <div className="min-w-0">
        <h2 className="text-title3 font-semibold text-text-primary">
          {title}
        </h2>
        {subtitle && (
          <p className="mt-0.5 text-footnote text-text-muted">{subtitle}</p>
        )}
      </div>
      {action && <div className="flex shrink-0 items-center gap-2">{action}</div>}
    </div>
  );
}
