export type ViewMode = "list" | "table";

export interface ViewToggleProps {
  mode: ViewMode;
  onChange: (m: ViewMode) => void;
}

export function ViewToggle({ mode, onChange }: ViewToggleProps) {
  return (
    <div className="flex min-h-[44px] overflow-hidden rounded-md border border-border-subtle">
      <button
        type="button"
        onClick={() => onChange("list")}
        className={`flex min-h-[44px] items-center px-3 py-1.5 text-subheadline transition-colors focus-visible:bg-surface-active focus-visible:outline-none ${
          mode === "list"
            ? "bg-accent/15 font-medium text-accent-strong"
            : "bg-surface-overlay text-text-secondary hover:text-text-primary"
        }`}
      >
        列表
      </button>
      <button
        type="button"
        onClick={() => onChange("table")}
        className={`flex min-h-[44px] items-center border-l border-border-subtle px-3 py-1.5 text-subheadline transition-colors focus-visible:bg-surface-active focus-visible:outline-none ${
          mode === "table"
            ? "bg-accent/15 font-medium text-accent-strong"
            : "bg-surface-overlay text-text-secondary hover:text-text-primary"
        }`}
      >
        表格
      </button>
    </div>
  );
}
