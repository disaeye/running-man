import { type HTMLAttributes } from "react";

type AvatarSize = "sm" | "md" | "lg";

interface AvatarProps extends HTMLAttributes<HTMLDivElement> {
  name: string;
  src?: string;
  size?: AvatarSize;
}

const sizeMap: Record<AvatarSize, { container: string; text: string }> = {
  sm: { container: "h-8 w-8", text: "text-caption1" },
  md: { container: "h-10 w-10", text: "text-subheadline" },
  lg: { container: "h-14 w-14", text: "text-callout" },
};

export function Avatar({
  name,
  src,
  size = "md",
  className = "",
  ...props
}: AvatarProps) {
  const dims = sizeMap[size];

  if (src) {
    return (
      <div
        data-testid="avatar"
        className={`${dims.container} relative rounded-full overflow-hidden shrink-0 ${className}`}
        {...props}
      >
        {/* eslint-disable-next-line @next/next/no-img-element -- avatar src is user-provided data URI, not a static asset */}
        <img
          src={src}
          alt={name}
          className="h-full w-full object-cover"
        />
      </div>
    );
  }

  return (
    <div
      data-testid="avatar"
      className={`
        ${dims.container} rounded-full
        border border-border-default bg-surface-card
        inline-flex items-center justify-center
        shrink-0
        ${className}
      `.trim()}
      {...props}
    >
      <span className={`${dims.text} font-medium text-text-secondary leading-none`}>
        {name.charAt(0).toUpperCase()}
      </span>
    </div>
  );
}
