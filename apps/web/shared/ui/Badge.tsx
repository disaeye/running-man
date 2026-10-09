import { type HTMLAttributes } from "react";

type BadgeVariant = "success" | "warning" | "error" | "info" | "neutral" | "accent";

interface BadgeProps extends HTMLAttributes<HTMLSpanElement> {
  variant?: BadgeVariant;
}

const variantStyles: Record<BadgeVariant, string> = {
  success: "bg-success/15 text-success border-success/30",
  warning: "bg-warning/15 text-warning border-warning/30",
  error: "bg-error/5 text-error border-error/40",
  info: "bg-info/15 text-info border-info/30",
  accent: "bg-accent/10 text-accent-strong border-accent/30",
  neutral: "bg-surface-overlay text-text-secondary border-border-default",
};

export function Badge({
  variant = "neutral",
  className = "",
  children,
  ...props
}: BadgeProps) {
  return (
    <span
      className={`
        inline-flex items-center rounded-full border px-2.5 py-0.5
        text-caption1 font-medium leading-none
        ${variantStyles[variant]}
        ${className}
      `.trim()}
      {...props}
    >
      {children}
    </span>
  );
}
