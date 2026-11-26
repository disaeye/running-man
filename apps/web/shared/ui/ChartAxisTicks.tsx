export function ChartAxisTicks({ min, max, top, bottom, left, right }: {
  readonly min: number;
  readonly max: number;
  readonly top: number;
  readonly bottom: number;
  readonly left: number;
  readonly right: number;
}) {
  return (
    <>
      {[0, 0.5, 1].map((ratio) => {
        const value = max - ratio * (max - min);
        const tickY = top + ratio * (bottom - top);
        return (
          <g key={ratio}>
            <line
              x1={left}
              x2={right}
              y1={tickY}
              y2={tickY}
              className="stroke-border-subtle/50"
              strokeWidth={1}
              vectorEffect="non-scaling-stroke"
            />
            <text x={left - 4} y={tickY + 2} textAnchor="end" fontSize={7} className="fill-text-muted">
              {Math.abs(value) >= 100 ? value.toFixed(0) : value.toFixed(1)}
            </text>
          </g>
        );
      })}
    </>
  );
}
