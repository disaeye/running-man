import { type HTMLAttributes } from "react";

interface CardProps extends HTMLAttributes<HTMLDivElement> {
  padding?: "none" | "sm" | "md" | "lg";
}

const PADDING = {
  none: "",
  sm: "p-4",
  md: "p-5 sm:p-6",
  lg: "p-6 sm:p-8",
} as const;

/**
 * The only panel primitive.
 *
 * Flat: one hairline edge, one radius, no shadow. Depth in this app comes from
 * the surface colour change against the dusk canvas, which is what makes a
 * dense data page readable; stacked shadows and stacked blur turned every panel
 * into the same grey box and buried the atmosphere behind them.
 *
 * Cards do not nest. A group of related panels is a `page-stack` or a grid;
 * a group inside one panel is a `border-t` separator.
 */
export function Card({
  padding = "md",
  className = "",
  children,
  ...props
}: CardProps) {
  return (
    <div
      className={`min-w-0 rounded-xl border border-border-subtle bg-surface-card text-text-primary ${PADDING[padding]} ${className}`.trim()}
      {...props}
    >
      {children}
    </div>
  );
}
