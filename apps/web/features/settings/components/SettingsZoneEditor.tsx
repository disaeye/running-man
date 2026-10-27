"use client";

export interface DraftRow {
  zone: number;
  name: string;
  min_pct: string;
  max_pct: string;
}

export const pct = (v: number | null) => (v === null ? "" : String(v));

function zoneBgClass(zone: number): string {
  if (zone >= 1 && zone <= 5) return `bg-zone-${zone}`;
  return "bg-surface-overlay";
}

export function validateZones(drafts: DraftRow[]): Map<number, string> {
  const errors = new Map<number, string>();
  for (const d of drafts) {
    const min = Number(d.min_pct);
    const max = d.max_pct === "" ? Infinity : Number(d.max_pct);
    if (Number.isNaN(min) || d.min_pct === "") {
      errors.set(d.zone, "最小值不能为空");
    } else if (!Number.isNaN(max) && max !== Infinity && min >= max) {
      errors.set(d.zone, "最小值须小于最大值");
    } else if (min < 0 || (max !== Infinity && max > 100)) {
      errors.set(d.zone, "百分比须在 0-100 之间");
    }
  }
  // Gaps / overlaps between adjacent zones
  const sorted = [...drafts].sort((a, b) => a.zone - b.zone);
  for (let i = 0; i < sorted.length - 1; i++) {
    const cur = sorted[i]!;
    const next = sorted[i + 1]!;
    const curMax = cur.max_pct === "" ? Infinity : Number(cur.max_pct);
    const nextMin = Number(next.min_pct);
    if (Number.isNaN(curMax) || Number.isNaN(nextMin)) continue;
    if (curMax !== nextMin) {
      errors.set(
        cur.zone,
        curMax < nextMin ? `与${next.name}存在间隔` : `与${next.name}存在重叠`,
      );
    }
  }
  return errors;
}

interface Zone {
  zone: number;
  name: string;
  min_pct: number;
  max_pct: number | null;
  min_value: number;
  max_value: number | null;
}

interface Props {
  zones: Zone[];
  unit: string;
  drafts: DraftRow[];
  errors: Map<number, string>;
  editable: boolean;
  onChange: (next: DraftRow[]) => void;
}

export function ZoneEditor({ zones, unit, drafts, errors, editable, onChange }: Props) {
  const update = (zone: number, field: "min_pct" | "max_pct", value: string) => {
    const next = drafts.map((d) => (d.zone === zone ? { ...d, [field]: value } : d));
    onChange(next);
  };

  return (
    <div>
      {editable && (
        <p className="mb-2 text-caption1 text-text-muted">输入百分比 (%)</p>
      )}
      <table className="hidden w-full border-collapse text-caption1 sm:table">
        <thead>
          <tr className="border-b border-border-subtle text-text-muted">
            <th className="pb-2 text-left font-medium">区间</th>
            <th className="pb-2 text-center font-medium">范围 ({unit})</th>
            <th className="pb-2 text-right font-medium">最小占比</th>
            <th className="pb-2 text-right font-medium">最大占比</th>
          </tr>
        </thead>
        <tbody>
          {zones.map((z, i) => {
            const d = drafts[i];
            if (!d) return null;
            const isLast = d.max_pct === "";
            const error = errors.get(z.zone);
            const inputCls = `w-16 rounded-md border bg-surface-sunken px-2 py-1 text-right text-caption1 font-mono tabular-nums text-text-primary focus:border-accent focus:outline-none ${error ? "border-error" : "border-border-subtle"}`;
            return (
              <tr key={z.zone} className="border-b border-border-subtle last:border-0">
                <td className="py-2.5 whitespace-nowrap">
                  <span
                    className={`mr-2 inline-block h-2 w-2 rounded-full align-middle ${zoneBgClass(z.zone)}`}
                  />
                  <span className="text-text-primary font-medium">{z.name}</span>
                </td>
                <td className="py-2.5 text-center text-text-primary font-mono font-semibold tabular-nums whitespace-nowrap px-2">
                  {z.min_value} — {z.max_value ?? "∞"}
                </td>
                <td className="py-2.5 text-right">
                  {editable ? (
                    <input type="number" inputMode="decimal" step="0.1" value={d.min_pct}
                      onChange={(e) => update(z.zone, "min_pct", e.target.value)} className={inputCls} />
                  ) : (
                    <span className="text-caption1 text-text-secondary tabular-nums">{z.min_pct}%</span>
                  )}
                </td>
                <td className="py-1.5 text-right">
                  {editable ? (
                    <input type="number" inputMode="decimal" step="0.1" placeholder={isLast ? "∞" : ""}
                      value={isLast ? "" : d.max_pct}
                      onChange={(e) => update(z.zone, "max_pct", e.target.value)}
                      className={`${inputCls} placeholder:text-text-muted`} />
                  ) : (
                    <span className="text-caption1 text-text-secondary tabular-nums">
                      {z.max_pct === null ? "∞" : `${z.max_pct}%`}
                    </span>
                  )}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
      {/* Mobile list */}
      <div className="flex flex-col gap-2 sm:hidden">
        {zones.map((z, i) => {
          const d = drafts[i];
          if (!d) return null;
          const error = errors.get(z.zone);
          return (
            <div key={z.zone} className="rounded-md border border-border-subtle bg-surface-overlay px-3 py-2">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <span className={`inline-block h-2 w-2 rounded-full ${zoneBgClass(z.zone)}`} />
                  <span className="text-subheadline text-text-primary">{z.name}</span>
                </div>
                <span className="text-caption1 text-text-muted">
                  {z.min_value}–{z.max_value ?? "∞"} {unit}
                </span>
              </div>
              {editable && (
                <div className="mt-2 grid grid-cols-2 gap-2">
                  <label className="flex flex-col gap-1 text-caption1 text-text-muted">
                    最小占比 (%)
                    <input type="number" inputMode="decimal" step="0.1" value={d.min_pct}
                      onChange={(e) => update(z.zone, "min_pct", e.target.value)}
                      className={`min-h-11 w-full rounded-md border bg-surface-sunken px-2 text-caption1 tabular-nums text-text-primary ${error ? "border-error" : "border-border-subtle"}`} />
                  </label>
                  <label className="flex flex-col gap-1 text-caption1 text-text-muted">
                    最大占比 (%)
                    <input type="number" inputMode="decimal" step="0.1" placeholder="∞"
                      value={d.max_pct === "" ? "" : d.max_pct}
                      onChange={(e) => update(z.zone, "max_pct", e.target.value)}
                      className={`min-h-11 w-full rounded-md border bg-surface-sunken px-2 text-caption1 tabular-nums text-text-primary placeholder:text-text-muted ${error ? "border-error" : "border-border-subtle"}`} />
                  </label>
                </div>
              )}
              {error && <p className="mt-1 text-caption1 text-error">{error}</p>}
            </div>
          );
        })}
      </div>
      {/* Desktop validation errors */}
      <div className="mt-1 hidden flex-wrap gap-x-3 gap-y-1 sm:flex">
        {drafts.map((d) => {
          const error = errors.get(d.zone);
          return error ? (
            <span key={d.zone} className="text-caption1 text-error">{d.name}: {error}</span>
          ) : null;
        })}
      </div>
    </div>
  );
}
