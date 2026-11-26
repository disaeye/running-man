"use client";

import { SlidingIndicator } from "@shared/ui/SlidingIndicator";

export function Segmented<T extends string>({
  value,
  options,
  onChange,
}: {
  value: T;
  options: readonly (T | { value: T; label: string })[];
  onChange: (value: T) => void;
}) {
  const entries: readonly { key: T; label: string }[] = options.map((option) =>
    typeof option === "string" ? { key: option, label: option } : { key: option.value, label: option.label },
  );

  return (
    <div className="relative flex rounded-full bg-secondary p-1">
      <SlidingIndicator
        variant="accent-pill"
        options={entries.map((entry) => ({ key: entry.key, selected: entry.key === value }))}
      />
      {entries.map((entry) => (
        <button
          type="button"
          key={entry.key}
          data-indicator-key={entry.key}
          onClick={() => onChange(entry.key)}
          aria-pressed={entry.key === value}
          className={`tactile relative z-10 inline-flex min-h-11 flex-1 items-center justify-center rounded-full bg-transparent px-3 text-xs font-medium ${
            entry.key === value ? "text-primary-foreground" : "text-muted-foreground hover:text-text-primary"
          }`}
        >
          {entry.label}
        </button>
      ))}
    </div>
  );
}

export const SegmentedControl = Segmented;
