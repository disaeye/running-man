import { type HTMLAttributes, type ReactNode } from "react";

interface EmptyStateProps extends HTMLAttributes<HTMLDivElement> {
  icon?: ReactNode;
  title: string;
  description?: string;
  action?: ReactNode;
}

export function EmptyState({
  icon,
  title,
  description,
  action,
  className = "",
  ...props
}: EmptyStateProps) {
  return (
    <div
      className={`
        flex flex-col items-center justify-center gap-3
        rounded-lg border border-dashed border-border-default
        px-6 py-12 text-center
        ${className}
      `.trim()}
      {...props}
    >
      {icon && (
        <div className="text-text-muted [&>svg]:h-10 [&>svg]:w-10">
          {icon}
        </div>
      )}
      <h2 className="text-callout font-semibold text-text-primary">
        {title}
      </h2>
      {description && (
        <p className="max-w-sm text-subheadline text-text-secondary">
          {description}
        </p>
      )}
      {action && <div className="mt-2">{action}</div>}
    </div>
  );
}
