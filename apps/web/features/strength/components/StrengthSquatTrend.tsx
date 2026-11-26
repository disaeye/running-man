"use client";

import { useMemo } from "react";
import { PageCard } from "@shared/ui/Card";
import { Tag } from "@shared/ui/Badge";
import { Sparkline } from "@shared/ui/Sparkline";
import type { E1rmItem } from "@shared/types/strength";

interface StrengthSquatTrendProps {
  e1rmHistory?: readonly E1rmItem[];
  currentE1rm?: number | null;
}

export function StrengthSquatTrend({ e1rmHistory = [], currentE1rm }: StrengthSquatTrendProps) {
  const squatPoints = useMemo(() => {
    const filtered = e1rmHistory
      .filter((item) => item.exercise_name.includes("深蹲") || item.exercise_name.toLowerCase().includes("squat"))
      .sort((a, b) => a.date.localeCompare(b.date));
    return filtered.slice(-12);
  }, [e1rmHistory]);

  const series = useMemo(() => {
    const values = squatPoints.map((p) => Math.round(p.estimated_1rm_kg));
    if (currentE1rm && currentE1rm > 0) {
      return [...values, Math.round(currentE1rm)];
    }
    return values;
  }, [squatPoints, currentE1rm]);

  if (series.length < 2) {
    return (
      <PageCard title="深蹲 e1RM 趋势" action={<Tag tone="outline">Epley 公式</Tag>}>
        <p className="text-caption1 text-muted-foreground">
          {currentE1rm && currentE1rm > 0
            ? `本次深蹲估算 e1RM 为 ${Math.round(currentE1rm)} kg；累计两次以上深蹲记录后将绘制趋势。`
            : "暂无足够深蹲历史记录；记录两次以上深蹲后将展示 e1RM 变化趋势。"}
        </p>
      </PageCard>
    );
  }

  const latest = series[series.length - 1]!;
  const first = series[0]!;
  const change = latest - first;

  return (
    <PageCard
      title="深蹲 e1RM 趋势"
      action={<Tag tone="warn">估算值 · Epley</Tag>}
    >
      <div className="space-y-3">
        <div className="flex items-baseline justify-between text-caption1 text-muted-foreground">
          <span>
            {currentE1rm && currentE1rm > 0 ? "含本次估算 " : "最近估算 "}
            <span className="num text-base font-semibold text-foreground">{latest}</span> kg
          </span>
          <span className="num">区间变化 {change >= 0 ? `+${change}` : change} kg</span>
        </div>
        <div className="h-[90px] w-full pt-1">
          <Sparkline
            data={series}
            variant="area"
            color="var(--color-primary)"
            height={80}
          />
        </div>
        <div className="flex justify-between text-caption1 text-muted-foreground">
          <span>共 {series.length} 次记录</span>
          <span>Epley 公式：负重 × (1 + 次数 / 30)</span>
        </div>
      </div>
    </PageCard>
  );
}
