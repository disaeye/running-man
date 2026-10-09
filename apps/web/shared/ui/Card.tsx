import { type HTMLAttributes } from "react";

interface CardProps extends HTMLAttributes<HTMLDivElement> {
  padding?: "none" | "sm" | "md" | "lg";
}

const paddingStyles = {
  none: "",
  sm: "p-4",
  md: "p-6",
  lg: "p-8",
};

export function Card({
  padding = "md",
  className = "",
  children,
  ...props
}: CardProps) {
  return (
    <div
      className={`
        min-w-0 rounded-2xl border border-border/80 bg-card text-card-foreground shadow-xs
        transition-all duration-200 hover:border-border hover:shadow-sm
        ${paddingStyles[padding]}
        ${className}
      `.trim()}
      {...props}
    >
      {children}
    </div>
  );
}
