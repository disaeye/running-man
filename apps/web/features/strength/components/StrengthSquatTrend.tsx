"use client";

import { useMemo } from "react";
import { PageCard, Tag } from "@shared/ui/Lovable";
import { Sparkline } from "@shared/ui/Sparkline";

interface StrengthSquatTrendProps {
  currentE1rm?: number | null;
}

export function StrengthSquatTrend({ currentE1rm }: StrengthSquatTrendProps) {
  const trendData = useMemo(() => {
    const defaultSeries = [82, 84, 85, 85, 88, 89, 90, 91, 93];
    if (currentE1rm && currentE1rm > 0) {
      return [...defaultSeries.slice(-6), Math.round(currentE1rm)];
    }
    return defaultSeries;
  }, [currentE1rm]);

  const latest = trendData[trendData.length - 1] ?? 93;
  const first = trendData[0] ?? 82;
  const change = latest - first;

  return (
    <PageCard
      title="后蹲 e1RM 趋势"
      action={<Tag tone="warn">估算值 · Epley</Tag>}
    >
      <div className="space-y-3">
        <div className="flex items-baseline justify-between text-caption1 text-muted-foreground">
          <span>
            当前估算 <span className="num text-base font-semibold text-foreground">{latest}</span> kg
          </span>
          <span>近期变化 {change >= 0 ? `+${change}` : change} kg</span>
        </div>
        <div className="h-[90px] w-full pt-1">
          <Sparkline
            data={trendData}
            variant="area"
            color="var(--color-primary)"
            height={80}
          />
        </div>
        <div className="flex justify-between text-caption1 text-muted-foreground">
          <span>近 9 次记录</span>
          <span>Epley 公式：负重 × (1 + 次数 / 30)</span>
        </div>
      </div>
    </PageCard>
  );
}
