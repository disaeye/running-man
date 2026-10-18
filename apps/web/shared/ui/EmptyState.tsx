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
      {/*
       * A message, not a section. This used to be an <h2>, which put the empty
       * state at the same outline level as the card that contained it: the
       * "最近训练" section and its own "还没有训练记录" line became siblings.
       */}
      <p className="text-callout font-semibold text-text-primary">
        {title}
      </p>
      {description && (
        <p className="max-w-sm text-subheadline text-text-secondary">
          {description}
        </p>
      )}
      {action && <div className="mt-2">{action}</div>}
    </div>
  );
}
