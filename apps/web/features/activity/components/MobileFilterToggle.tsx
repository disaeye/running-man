import { ChevronDown, ChevronUp } from "lucide-react";

export interface MobileFilterToggleProps {
  open: boolean;
  onToggle: () => void;
}

/**
 * Sm-hidden collapsible trigger for the activity filter panel.
 * Visible only on mobile (`sm:hidden`); the desktop filter panel is
 * always visible.
 */
export function MobileFilterToggle({ open, onToggle }: MobileFilterToggleProps) {
  return (
    <button
      type="button"
      onClick={onToggle}
      className="focus-ring flex min-h-[44px] items-center gap-1.5 rounded-md border border-border-subtle bg-surface-overlay px-3 py-2 text-subheadline text-text-secondary transition-colors hover:border-border-default sm:hidden"
      aria-expanded={open}
      aria-controls="activity-filters"
    >
      <svg className="h-4 w-4" viewBox="0 0 20 20" fill="currentColor" aria-hidden="true">
        <path fillRule="evenodd" d="M3 3a1 1 0 011-1h12a1 1 0 011 1v3a1 1 0 01-.293.707L12 11.414V15a1 1 0 01-.293.707l-2 2A1 1 0 018 17v-5.586L3.293 6.707A1 1 0 013 6V3z" clipRule="evenodd" />
      </svg>
      筛选
      <span aria-hidden="true" className="text-caption2">
        {open ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
      </span>
    </button>
  );
}
