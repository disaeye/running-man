"use client";

import Link from "next/link";
import { ChevronRight } from "lucide-react";
import { PageCard } from "@shared/ui/Lovable";
import { LovableChart } from "@shared/ui/LovableChart";
import { useProfile } from "@features/settings/hooks/useProfile";
import { formatPace } from "@features/today/hooks/useAbility";
import { useThresholdHistory } from "@features/settings/hooks/useThresholdHistory";
import { useActivities } from "@features/activity/hooks/useActivities";
import { useCurrentReadings } from "@features/health/lib/physiology-display";
import { getSportConfig } from "@shared/config/sport-config";
import { NO_VALUE } from "@shared/lib/use-data-state";
import { formatPaceFromSeconds } from "@shared/lib/format";

export function AnalysisPerformance({ from, to }: { from: string; to: string }) {
  const { profile } = useProfile();
  const { entries } = useThresholdHistory();
  const activities = useActivities(from, to).data;
  const vo2max = useCurrentReadings().vo2max;
  // 活动列表是新到旧；时间序列从旧到新画，横轴才不会反向
  const efPoints = activities
    .map((activity) => ({
      day: activity.start_time.slice(0, 10),
      value: activity.avg_speed != null && activity.avg_hr != null && activity.avg_hr > 0 ? activity.avg_speed / activity.avg_hr : null,
    }))
    .filter((point) => point.value != null)
    .reverse();
  const metrics = [
    { label: "最大摄氧量", value: vo2max != null ? vo2max.value.toFixed(1) : NO_VALUE, unit: "ml/kg/min", source: vo2max != null ? "设备" : "未记录", note: vo2max != null ? `记录于 ${vo2max.day} · 特定训练日由设备估算` : "设备未同步最大摄氧量" },
    { label: "乳酸阈心率 LTHR", value: profile?.lthr ?? NO_VALUE, unit: "bpm", source: "估算", note: "由阈值课表现反推" },
    { label: "阈值配速", value: formatPace(profile?.threshold_pace), unit: "/km", source: "估算", note: "由长距离与阈值课样本反推" },
    { label: "最大心率 HRmax", value: profile?.hr_max ?? NO_VALUE, unit: "bpm", source: "设置", note: "按设置值或年龄估算" },
  ];
  const paces = entries.filter((entry) => entry.threshold_pace != null);
  const supporting = activities.filter((activity) => activity.avg_speed != null && activity.avg_speed > 0).slice(-4).reverse();
  return <div className="space-y-4" data-testid="analysis-performance">
    <div className="grid grid-cols-2 gap-3">{metrics.map((metric) => <div key={metric.label} className="surface p-3"><div className="flex items-center justify-between text-xs text-muted-foreground"><span>{metric.label}</span><span>{metric.source}</span></div><div className="num mt-1 text-3xl font-bold">{metric.value}<span className="ml-1 text-xs font-normal text-muted-foreground">{metric.unit}</span></div><div className="text-caption1 text-muted-foreground">{metric.note}</div></div>)}</div>
    <PageCard title="阈值配速趋势">{paces.length > 1 ? <div className="mb-2 flex justify-between text-sm"><span>期初 <span className="num">{formatPace(paces[0]?.threshold_pace)}</span></span><span className="text-accent-strong">最新 <span className="num">{formatPace(paces.at(-1)?.threshold_pace)}</span>/km</span></div> : null}<LovableChart h={120} invertY labels={paces.map((entry) => entry.effective_from.slice(5))} lines={[{ data: paces.map((entry) => entry.threshold_pace ?? 0), cls: "stroke-primary", label: "阈值配速", format: (v) => formatPaceFromSeconds(Math.round(v)) }]} /><div className="mt-3 text-xs text-muted-foreground">支撑本次估算的活动</div>{supporting.length ? <div className="mt-2 space-y-2">{supporting.map((activity) => <Link key={activity.activity_id} href={`/activities/${activity.activity_id}`} className="flex items-center justify-between rounded-lg bg-secondary p-2.5 text-sm"><span>{getSportConfig(activity.sport).label} · {activity.start_time.slice(0, 10)}</span><span className="num flex items-center gap-1 text-muted-foreground">{formatPaceFromSeconds(Math.round(1000 / (activity.avg_speed ?? 1)))}<ChevronRight className="h-4 w-4" /></span></Link>)}</div> : <p className="mt-2 text-sm text-muted-foreground">所选时间范围内没有可用的活动</p>}</PageCard>
    <PageCard title="效率系数 EF"><LovableChart h={90} labels={efPoints.map((point) => point.day.slice(5))} lines={[{ data: efPoints.map((point) => point.value ?? 0), cls: "stroke-fitness", label: "EF", format: (v) => v.toFixed(2) }]} /><p className="mt-2 text-caption1 text-muted-foreground">有氧效率 = 速度 ÷ 心率，同一心率下跑得越快数值越高。轻松跑长期上升说明有氧基础在变好；单次变化受天气、坡度影响，看趋势不看单点。</p></PageCard>
  </div>;
}
