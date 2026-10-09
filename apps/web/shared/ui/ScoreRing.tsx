import { type HTMLAttributes, type ReactNode } from "react";

export interface ScoreRingBand {
  min: number;
  max: number;
  color: string;
}

interface ScoreRingProps extends HTMLAttributes<HTMLDivElement> {
  value: number;
  max?: number;
  size?: number;
  strokeWidth?: number;
  color?: string;
  bands?: ScoreRingBand[];
  ariaLabel?: string;
  children?: ReactNode;
}

export function ScoreRing({
  value,
  max = 100,
  size = 80,
  strokeWidth = 6,
  color = "var(--color-ctl)",
  bands,
  ariaLabel,
  children,
  className = "",
  ...props
}: ScoreRingProps) {
  const clampedValue = Math.max(0, Math.min(value, max));
  const percent = max > 0 ? (clampedValue / max) * 100 : 0;
  const radius = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;
  const offset = circumference - (percent / 100) * circumference;
  const center = size / 2;
  const ariaProps: {
    role: "img" | undefined;
    "aria-hidden": true | undefined;
    "aria-label": string | undefined;
  } =
    ariaLabel === ""
      ? { role: undefined, "aria-hidden": true, "aria-label": undefined }
      : { role: "img", "aria-hidden": undefined, "aria-label": ariaLabel ?? `${Math.round(percent)}%` };

  return (
    <div
      className={`relative inline-flex items-center justify-center ${className}`.trim()}
      {...props}
    >
      <svg
        width={size}
        height={size}
        viewBox={`0 0 ${size} ${size}`}
        className="-rotate-90"
        {...ariaProps}
      >
        <circle
          cx={center}
          cy={center}
          r={radius}
          fill="none"
          stroke="var(--color-surface-active)"
          strokeWidth={strokeWidth}
        />
        {bands?.map((band, i) => {
          const bandStart = Math.max(0, Math.min(band.min, max));
          const bandEnd = Math.max(0, Math.min(band.max, max));
          const startPercent = max > 0 ? (bandStart / max) * 100 : 0;
          const endPercent = max > 0 ? (bandEnd / max) * 100 : 0;
          const bandLength = ((endPercent - startPercent) / 100) * circumference;
          const bandOffset = circumference - (startPercent / 100) * circumference;
          return (
            <circle
              key={i}
              cx={center}
              cy={center}
              r={radius}
              fill="none"
              stroke={band.color}
              strokeWidth={strokeWidth}
              strokeDasharray={`${bandLength} ${circumference - bandLength}`}
              strokeDashoffset={bandOffset}
              opacity={0.25}
            />
          );
        })}
        <circle
          cx={center}
          cy={center}
          r={radius}
          fill="none"
          stroke={color}
          strokeWidth={strokeWidth}
          strokeLinecap="round"
          strokeDasharray={circumference}
          strokeDashoffset={offset}
          className="transition-all duration-500 ease-out"
        />
      </svg>
      {children && (
        <div className="absolute inset-0 flex items-center justify-center">
          {children}
        </div>
      )}
    </div>
  );
}
