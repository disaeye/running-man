export function ShowcaseHeading({ title, subtitle }: { title: string; subtitle?: string }) {
  return (
    <div className="flex flex-wrap items-baseline justify-between gap-2 border-b border-border-subtle pb-2">
      <h2 className="text-title3 font-semibold text-text-primary">{title}</h2>
      {subtitle ? <span className="text-caption1 text-text-muted">{subtitle}</span> : null}
    </div>
  );
}
