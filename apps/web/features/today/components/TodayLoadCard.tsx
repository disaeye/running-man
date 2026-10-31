"use client";

import type { PmcPoint } from "@features/pmc/hooks/usePmcData";
import { NO_VALUE } from "@shared/lib/use-data-state";

export function TodayLoadCard({ point }: { readonly point: PmcPoint | null }) {
  return (
    <section aria-labelledby="today-load-title" className="rounded-[18px] border border-border-subtle bg-surface-card p-4">
      <div className="flex items-center justify-between gap-3">
        <h2 id="today-load-title" className="text-caption1 text-text-muted">短期负荷</h2>
        <span className="text-caption1 text-text-muted">来源：PMC</span>
      </div>
      <div className="mt-3 grid grid-cols-2 gap-x-4 gap-y-3 sm:grid-cols-4">
        <Reading label="CTL 体能" value={point?.ctl} />
        <Reading label="ATL 疲劳" value={point?.atl} />
        <Reading label="TSB 状态" value={point?.tsb} />
        <Reading label="ACWR" value={point?.acwr} />
      </div>
    </section>
  );
}

function Reading({ label, value }: { readonly label: string; readonly value: number | null | undefined }) {
  return (
    <div>
      <p className="text-caption1 text-text-muted">{label}</p>
      <p className="mt-1 font-display text-2xl font-bold tabular-nums text-text-primary">
        {value == null ? NO_VALUE : value.toFixed(1)}
      </p>
    </div>
  );
}
