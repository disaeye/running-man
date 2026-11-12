"use client";

import { EyeOff } from "lucide-react";
import { PageCard, Stat, Tag } from "@shared/ui/Lovable";
import { LovableChart } from "@shared/ui/LovableChart";
import { useWellness } from "@features/health/hooks/useWellness";
import { useWeeklyProgress } from "@features/today/hooks/useWeeklyProgress";
import { NO_VALUE } from "@shared/lib/use-data-state";

export function AnalysisBodyLife({ from, to }: { from: string; to: string }) {
  const wellness = useWellness(from, to);
  const weekly = useWeeklyProgress(from, to);
  const weight = wellness.data.filter((point) => point.weight != null);
  const bodyFat = wellness.data.filter((point) => point.body_fat_pct != null).at(-1)?.body_fat_pct ?? null;
  const sleep = wellness.data.filter((point) => point.sleep_secs != null);
  const mood = wellness.data.filter((point) => point.mood != null);
  const latest = weight.at(-1)?.weight ?? null;
  const weightDelta = weight.length > 1 ? latest! - weight[0]!.weight! : null;
  const weeks = Math.max(1, Math.round((new Date(to).getTime() - new Date(from).getTime()) / (7 * 86400000)));
  return <div className="space-y-4" data-testid="analysis-body">
    <PageCard title="体重 · 体脂率" action={<Tag>与周跑量仅时间并列</Tag>}>
      <div className="mb-2 grid grid-cols-3 gap-2">
        <Stat label="体重" value={latest ?? NO_VALUE} unit="kg" sub={weightDelta != null ? `${weeks} 周 ${weightDelta > 0 ? "+" : ""}${weightDelta.toFixed(1)}` : undefined} />
        <Stat label="体脂率" value={bodyFat ?? NO_VALUE} unit="%" />
        <Stat label="周跑量" value={weekly.weeks.length ? (weekly.weeks.at(-1)!.actual_distance_m / 1000).toFixed(1) : NO_VALUE} unit="km" />
      </div>
      <LovableChart h={100} labels={weight.map((point) => point.day.slice(5))} bars={{ data: weekly.weeks.map((week) => week.actual_distance_m / 1000), cls: "fill-muted-foreground/20", label: "周跑量", format: (v) => `${v.toFixed(1)} km` }} lines={[{ data: weight.map((point) => point.weight ?? 0), cls: "stroke-primary", label: "体重", format: (v) => `${v.toFixed(1)} kg` }]} />
    </PageCard>
    <PageCard title="睡眠"><LovableChart h={80} labels={sleep.map((point) => point.day.slice(5))} lines={[{ data: sleep.map((point) => (point.sleep_secs ?? 0) / 3600), cls: "stroke-fitness", label: "睡眠", format: (v) => `${v.toFixed(1)} h` }]} /></PageCard>
    <PageCard title="主观状态 · 心情">{mood.length ? <LovableChart h={60} labels={mood.map((point) => point.day.slice(5))} lines={[{ data: mood.map((point) => point.mood ?? 0), cls: "stroke-warn", label: "心情", format: (v) => v.toFixed(0) }]} /> : <p className="text-sm text-muted-foreground">未持续记录心情</p>}</PageCard>
    <div className="flex items-center gap-2 rounded-xl border border-dashed p-3 text-xs text-muted-foreground"><EyeOff className="h-4 w-4" />未持续记录已折叠：血氧、血压、营养摄入、生理周期</div>
  </div>;
}
