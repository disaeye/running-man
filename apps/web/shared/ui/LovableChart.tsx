export function LovableChart({ lines = [], bars, h = 140, zero = false }: {
  lines?: { data: number[]; cls: string; dashed?: boolean }[];
  bars?: { data: number[]; cls: string };
  h?: number;
  zero?: boolean;
}) {
  const width = 320;
  const all = [...lines.flatMap((line) => line.data), ...(zero ? [0] : [])];
  const min = Math.min(...all, 0);
  const max = Math.max(...all, 1);
  const count = Math.max(lines[0]?.data.length ?? 0, bars?.data.length ?? 0, 1);
  const x = (index: number) => (index / Math.max(1, count - 1)) * width;
  const y = (value: number) => h - ((value - min) / (max - min || 1)) * (h - 8) - 4;
  const barMax = bars ? Math.max(...bars.data, 1) : 1;
  return <svg viewBox={`0 0 ${width} ${h}`} className="w-full" preserveAspectRatio="none" style={{ height: h }} aria-hidden="true">
    {bars?.data.map((value, index) => <rect key={index} x={x(index) - width / count / 2.6} width={width / count / 1.3} y={h - (value / barMax) * h * 0.55} height={(value / barMax) * h * 0.55} className={bars.cls} rx={1} />)}
    {zero && min < 0 ? <line x1={0} x2={width} y1={y(0)} y2={y(0)} className="stroke-border" strokeWidth={1} /> : null}
    {lines.map((line, index) => <polyline key={index} fill="none" strokeWidth={2} strokeLinejoin="round" strokeDasharray={line.dashed ? "4 4" : undefined} className={line.cls} points={line.data.map((value, point) => `${x(point)},${y(value)}`).join(" ")} vectorEffect="non-scaling-stroke" />)}
  </svg>;
}

export function LovableLegend({ items }: { items: { label: string; cls: string }[] }) {
  return <div className="mt-2 flex flex-wrap gap-3 text-caption1 text-muted-foreground">{items.map((item) => <span key={item.label} className="flex items-center gap-1.5"><span className={`h-2 w-2 rounded-full ${item.cls}`} />{item.label}</span>)}</div>;
}
