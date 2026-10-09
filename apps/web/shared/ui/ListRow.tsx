import { type ButtonHTMLAttributes, type ReactNode } from "react";
import { ChevronRight } from "lucide-react";
import { cn } from "@shared/lib/utils";

interface ListRowProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  label: ReactNode;
  description?: ReactNode;
  leading?: ReactNode;
  trailing?: ReactNode;
  chevron?: boolean;
}

export function ListRow({
  label,
  description,
  leading,
  trailing,
  chevron = false,
  className,
  ...props
}: ListRowProps) {
  return (
    <button
      type="button"
      className={cn(
        "focus-ring flex min-h-[44px] w-full items-center gap-3 rounded-lg px-4 py-3 text-start",
        "bg-surface-card transition-colors hover:bg-surface-overlay active:scale-[0.99]",
        "disabled:pointer-events-none disabled:opacity-50",
        className,
      )}
      {...props}
    >
      {leading && <span className="flex shrink-0 items-center">{leading}</span>}
      <span className="min-w-0 flex-1">
        <span className="block text-subheadline font-medium text-text-primary">
          {label}
        </span>
        {description && (
          <span className="mt-0.5 block text-footnote text-text-muted">
            {description}
          </span>
        )}
      </span>
      {trailing && (
        <span className="flex shrink-0 items-center text-subheadline text-text-muted">
          {trailing}
        </span>
      )}
      {chevron && (
        <ChevronRight
          className="size-5 shrink-0 text-text-muted"
          aria-hidden
        />
      )}
    </button>
  );
}
