import { type HTMLAttributes } from "react";

interface SkeletonProps extends HTMLAttributes<HTMLDivElement> {
  variant?: "text" | "circular" | "rectangular";
  width?: string | number;
  height?: string | number;
}

export function Skeleton({
  variant = "text",
  width,
  height,
  className = "",
  ...props
}: SkeletonProps) {
  const baseClasses =
    "animate-pulse bg-surface-overlay rounded-md";

  const variantClasses = {
    text: "h-4 w-full",
    circular: "rounded-full",
    rectangular: "",
  };

  const style: React.CSSProperties = {};
  if (width !== undefined) style.width = typeof width === "number" ? `${width}px` : width;
  if (height !== undefined) style.height = typeof height === "number" ? `${height}px` : height;

  return (
    <div
      aria-hidden="true"
      className={`
        ${baseClasses}
        ${variantClasses[variant]}
        ${className}
      `.trim()}
      style={style}
      {...props}
    />
  );
}
