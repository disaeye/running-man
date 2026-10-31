"use client";

import { useMemo } from "react";
import { EyeOff } from "lucide-react";
import { PageCard, Stat, Tag } from "@shared/ui/Lovable";
import { LovableChart } from "@shared/ui/LovableChart";
import { useWellness } from "@features/health/hooks/useWellness";
import { useWeeklyProgress } from "@features/today/hooks/useWeeklyProgress";
import { athleteRange, useAthleteTimezone } from "@shared/lib/training-day";

export function AnalysisBodyLife({ days }: { days: number }) {
  const timezone = useAthleteTimezone();
  const range = useMemo(() => athleteRange(days, timezone), [days, timezone]);
  const wellness = useWellness(range.from, range.to);
  const weekly = useWeeklyProgress(range.from, range.to);
  const weight = wellness.data.filter((point) => point.weight != null);
  const bodyFat = wellness.data.filter((point) => point.body_fat_pct != null).at(-1)?.body_fat_pct ?? null;
  const sleep = wellness.data.filter((point) => point.sleep_secs != null);
  const mood = wellness.data.filter((point) => point.mood != null);
  const latest = weight.at(-1)?.weight ?? null;
  return <>
    <PageCard title="体重 · 体脂率" action={<Tag>与周跑量仅时间并列</Tag>}><div className="mb-2 grid grid-cols-3 gap-2"><Stat label="体重" value={latest ?? "未记录"} unit="kg" /><Stat label="体脂率" value={bodyFat ?? "未记录"} unit="%" /><Stat label="周跑量" value={weekly.weeks.length ? (weekly.weeks.at(-1)!.actual_distance_m / 1000).toFixed(1) : "0"} unit="km" /></div><LovableChart h={100} bars={{ data: weekly.weeks.map((week) => week.actual_distance_m / 1000), cls: "fill-muted-foreground/20" }} lines={[{ data: weight.map((point) => point.weight ?? 0), cls: "stroke-primary" }]} /></PageCard>
    <PageCard title="睡眠"><LovableChart h={80} lines={[{ data: sleep.map((point) => (point.sleep_secs ?? 0) / 3600), cls: "stroke-fitness" }]} /></PageCard>
    <PageCard title="主观状态 · 心情">{mood.length ? <LovableChart h={60} lines={[{ data: mood.map((point) => point.mood ?? 0), cls: "stroke-warn" }]} /> : <p className="text-sm text-muted-foreground">未持续记录心情</p>}</PageCard>
    <div className="flex items-center gap-2 rounded-xl border border-dashed p-3 text-xs text-muted-foreground"><EyeOff className="h-4 w-4" />未持续记录已折叠：血氧、血压、营养摄入、生理周期</div>
  </>;
}
