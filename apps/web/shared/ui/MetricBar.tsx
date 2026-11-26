export function Bar({
  value,
  max,
  tone = "bg-primary",
  className = "",
}: {
  value: number;
  max: number;
  tone?: string;
  className?: string;
}) {
  const ratio = Math.min(1, max > 0 ? value / max : 0);
  return (
    <div className={`h-1.5 w-full overflow-hidden rounded-full bg-secondary ${className}`.trim()}>
      <div
        className={`fill-motion h-full rounded-full ${tone}`}
        style={{ transform: `scaleX(${ratio})` }}
      />
    </div>
  );
}

export const MetricBar = Bar;
