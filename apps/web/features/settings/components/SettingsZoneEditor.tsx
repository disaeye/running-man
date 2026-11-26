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

interface HrZoneMeta {
  readonly label: string;
  readonly role: string;
  readonly barPct: number;
}

const HR_ZONE_META: Record<number, HrZoneMeta> = {
  1: { label: "Z1 恢复区", role: "热身 / 主动恢复", barPct: 24 },
  2: { label: "Z2 有氧区", role: "有氧基础 / 长距离", barPct: 43 },
  3: { label: "Z3 节奏区", role: "马拉松稳态配速", barPct: 62 },
  4: { label: "Z4 阈值区", role: "乳酸临界 / 巡航", barPct: 81 },
  5: { label: "Z5 极限区", role: "最大摄氧 / 无氧刺激", barPct: 100 },
};

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
  hrScheme?: string;
  hrMax?: number | null;
  lthr?: number | null;
  restingHr?: number | null;
  onChange: (next: DraftRow[]) => void;
}

function previewBpm(
  pctText: string,
  fallback: number | null,
  scheme: string | undefined,
  hrMax: number | null | undefined,
  lthr: number | null | undefined,
  restingHr: number | null | undefined,
): number | null {
  if (pctText === "") return null;
  const pctNum = Number(pctText);
  if (!Number.isFinite(pctNum)) return fallback;
  const ratio = pctNum / 100;
  if (scheme === "lthr" && lthr != null) return Math.round(ratio * lthr);
  if ((scheme === "karvonen" || scheme === "hrr") && hrMax != null && restingHr != null) {
    return Math.round(restingHr + ratio * (hrMax - restingHr));
  }
  if (hrMax != null) return Math.round(ratio * hrMax);
  return fallback;
}

function formatPctRange(minPct: number, maxPct: number | null): string {
  return maxPct == null ? `≥ ${minPct}%` : `${minPct}–${maxPct}%`;
}

/** 心率五档区间卡片流：浏览态与配速区间视觉一致，编辑态就地展开百分比输入与实时 bpm 预览。 */
export function ZoneEditor({
  zones,
  unit,
  drafts,
  errors,
  editable,
  hrScheme,
  hrMax,
  lthr,
  restingHr,
  onChange,
}: Props) {
  const update = (zone: number, field: "min_pct" | "max_pct", value: string) => {
    const next = drafts.map((d) => (d.zone === zone ? { ...d, [field]: value } : d));
    onChange(next);
  };

  return (
    <div>
      {editable && (
        <p className="mb-2 text-caption1 text-text-muted">调整各区间占比 (%)，右侧同步预览区间范围</p>
      )}
      <ul className="space-y-2">
        {zones.map((z, i) => {
          const d = drafts[i];
          if (!d) return null;
          const error = errors.get(z.zone);
          const isLast = d.max_pct === "";
          const changed = editable && (d.min_pct !== pct(z.min_pct) || d.max_pct !== pct(z.max_pct));
          const shownMin = changed
            ? (previewBpm(d.min_pct, z.min_value, hrScheme, hrMax, lthr, restingHr) ?? z.min_value)
            : z.min_value;
          const shownMax = changed
            ? (isLast ? null : previewBpm(d.max_pct, z.max_value, hrScheme, hrMax, lthr, restingHr))
            : z.max_value;
          const meta = HR_ZONE_META[z.zone] ?? {
            label: `Z${z.zone} ${z.name}`,
            role: "心率区间",
            barPct: Math.min(100, z.zone * 20),
          };
          const barClass = zoneBgClass(z.zone);
          const inputCls = `focus-ring min-h-10 w-full rounded-md border bg-surface-sunken px-2.5 text-right font-mono text-caption1 tabular-nums text-text-primary ${error ? "border-error" : "border-border-subtle"}`;

          return (
            <li
              key={z.zone}
              className={`rounded-xl border bg-surface-overlay/55 px-3.5 py-2.5 ${error ? "border-error/60" : "border-border-subtle"}`}
            >
              <div className="flex items-center gap-3">
                <span aria-hidden="true" className={`h-8 w-1.5 shrink-0 rounded-full ${barClass}`} />
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
                    <span className="text-subheadline font-semibold text-text-primary">
                      {meta.label}
                    </span>
                    <span className="text-caption1 text-text-muted">{meta.role}</span>
                  </div>
                  <div className="mt-1.5 flex items-center gap-2.5">
                    <div
                      aria-hidden="true"
                      className="h-1.5 max-w-[10rem] flex-1 overflow-hidden rounded-full bg-surface-sunken"
                    >
                      <div
                        className={`h-full rounded-full ${barClass}`}
                        style={{ width: `${meta.barPct}%` }}
                      />
                    </div>
                    <span className="font-mono text-caption1 tabular-nums text-text-muted">
                      {editable
                        ? isLast
                          ? `≥ ${d.min_pct || "0"}%`
                          : `${d.min_pct || "0"}–${d.max_pct}%`
                        : formatPctRange(z.min_pct, z.max_pct)}
                    </span>
                  </div>
                </div>
                <div className="shrink-0 text-right">
                  <span className="font-mono text-subheadline font-semibold tabular-nums text-text-primary">
                    {shownMin} – {shownMax ?? "∞"} {unit}
                  </span>
                </div>
              </div>

              {editable && (
                <div className="mt-3 grid grid-cols-2 gap-2.5 border-t border-border-subtle pt-2.5 pl-4">
                  <label className="flex flex-col gap-1 text-caption1 text-text-muted">
                    最小占比 (%)
                    <input
                      type="number"
                      inputMode="decimal"
                      step="0.1"
                      value={d.min_pct}
                      onChange={(e) => update(z.zone, "min_pct", e.target.value)}
                      className={inputCls}
                    />
                  </label>
                  <label className="flex flex-col gap-1 text-caption1 text-text-muted">
                    最大占比 (%)
                    <input
                      type="number"
                      inputMode="decimal"
                      step="0.1"
                      placeholder="∞"
                      value={isLast ? "" : d.max_pct}
                      onChange={(e) => update(z.zone, "max_pct", e.target.value)}
                      className={`${inputCls} placeholder:text-text-muted`}
                    />
                  </label>
                </div>
              )}

              {error && <p className="mt-1.5 pl-4 text-caption1 text-error">{error}</p>}
            </li>
          );
        })}
      </ul>
    </div>
  );
}
