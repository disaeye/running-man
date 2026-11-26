interface LegendItem {
  label: string;
  cls: string;
  lineStyle?: "solid" | "dashed" | "dotted";
  kind?: "line" | "bar";
}

export function LovableLegend({ items }: { items: LegendItem[] }) {
  return (
    <div className="mt-2 flex flex-wrap gap-3 text-caption1 text-text-muted">
      {items.map((item) => (
        <span key={item.label} className="flex items-center gap-1.5">
          {item.kind === "bar" ? (
            <span className={`h-2 w-4 rounded-sm ${item.cls}`} aria-hidden="true" />
          ) : (
            <svg width="20" height="6" aria-hidden="true">
              <line x1="1" x2="19" y1="3" y2="3" className={item.cls.replace(/^bg-/, "stroke-")} strokeWidth="2" strokeDasharray={item.lineStyle === "dashed" ? "4 3" : item.lineStyle === "dotted" ? "1 3" : undefined} />
            </svg>
          )}
          {item.label}
        </span>
      ))}
    </div>
  );
}
