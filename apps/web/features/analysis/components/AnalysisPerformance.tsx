"use client";

import Link from "next/link";
import useSWR from "swr";
import { ChevronRight } from "lucide-react";
import { PageCard } from "@shared/ui/Lovable";
import { LovableChart } from "@shared/ui/LovableChart";
import { callOrvalValidated } from "@shared/api/orval-adapter";
import { physiologyApiV1AthletesMePhysiologyGet } from "@shared/api/generated/clients";
import * as Generated from "@shared/api/generated/model";
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
  // 估算体系的样本门控：接口明确说不足才拦，读不到时按已满足处理。
  const physiology = useSWR("/athletes/me/physiology", {
    fetcher: () => callOrvalValidated((f) => physiologyApiV1AthletesMePhysiologyGet({}, f), Generated.PhysiologyResponse),
  });
  const insufficient = physiology.data != null && physiology.data.data_sufficient === false;
  // 活动列表是新到旧；时间序列从旧到新画，横轴才不会反向
  const efPoints = activities
    .map((activity) => ({
      day: activity.start_time.slice(0, 10),
      value: activity.avg_speed != null && activity.avg_hr != null && activity.avg_hr > 0 ? activity.avg_speed / activity.avg_hr : null,
    }))
    .filter((point) => point.value != null)
    .reverse();
  const metrics = [
    // 样本不足时不把数字当结论：与首页就绪分数同一规则，说明缺什么。
    { label: "最大摄氧量", value: insufficient ? "样本不足" : vo2max != null ? vo2max.value.toFixed(1) : NO_VALUE, unit: insufficient ? "" : "ml/kg/min", source: insufficient ? "估算" : vo2max != null ? "设备" : "未记录", note: insufficient ? "最大强度课样本还不够，跑几次全力课后才会给出读数" : vo2max != null ? `记录于 ${vo2max.day} · 特定训练日由设备估算` : "设备未同步最大摄氧量" },
    { label: "乳酸阈心率 LTHR", value: insufficient ? "样本不足" : profile?.lthr ?? NO_VALUE, unit: insufficient ? "" : "bpm", source: "估算", note: insufficient ? "需要更多阈值课样本才能反推" : "由阈值课表现反推" },
    { label: "阈值配速", value: insufficient ? "样本不足" : formatPace(profile?.threshold_pace), unit: insufficient ? "" : "/km", source: "估算", note: insufficient ? "需要更多长距离与阈值课样本" : "由长距离与阈值课样本反推" },
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
