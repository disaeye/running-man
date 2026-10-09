"use client";

// Load tab · PMC hero anchor
// Renders the PMC chart as the top-of-tab hero with unified card chrome.

import type { PmcPoint } from "@features/pmc/hooks/usePmcData";
import { Card } from "@shared/ui/Card";
import { ChartShell } from "@shared/ui/ChartShell";
import { SectionHeader } from "@shared/ui/SectionHeader";
import { LOADING_LABEL } from "@shared/lib/use-data-state";
import { PMCChart } from "@features/pmc/components/PMCChart";

interface LoadHeroProps {
  readonly data: readonly PmcPoint[];
  readonly loading: boolean;
  readonly error: string | null;
  readonly rangeFrom: string;
  readonly rangeTo: string;
}

export function LoadHero({
  data,
  loading,
  error,
  rangeFrom,
  rangeTo,
}: LoadHeroProps) {
  return (
    <Card padding="md" data-testid="load-pmc-hero">
      <SectionHeader
        title="训练负荷趋势"
        subtitle={`PMC · 体能 / 疲劳 / 状态 · ${rangeFrom} → ${rangeTo} · ${data.length} 个步点`}
      />
      <div className="mt-4">
        {error ? (
          <div
            className="flex h-64 items-center justify-center text-subheadline text-error"
            data-testid="analysis-load-error"
          >
            {error}
          </div>
        ) : loading && data.length === 0 ? (
          <div className="flex h-64 items-center justify-center text-subheadline text-text-muted">
            {LOADING_LABEL}
          </div>
        ) : data.length === 0 ? (
          <div className="flex h-64 items-center justify-center text-subheadline text-text-muted">
            此区间还没有训练负荷数据
          </div>
        ) : (
          <PMCChart data={[...data]} />
        )}
      </div>
    </Card>
  );
}

export { ChartShell };
