"use client";

import Link from "next/link";
import { ChevronRight } from "lucide-react";
import { PageCard } from "@shared/ui/Lovable";
import { usePersonalRecords } from "@features/performance/hooks/usePersonalRecords";

export function PersonalRecordsHall() {
  const { data, loading, error } = usePersonalRecords();
  if (loading) return <p className="text-sm text-muted-foreground">正在读取最佳成绩…</p>;
  if (error) return <p role="alert" className="text-sm text-destructive">{error}</p>;
  if (data.length === 0) return <p className="text-sm text-muted-foreground">暂无最佳成绩记录</p>;
  return <div className="grid grid-cols-2 gap-2">{data.map((record) => <Link key={`${record.sport}-${record.type}-${record.date}`} href={`/activities/${record.activityId}`} className="rounded-xl bg-secondary p-3"><div className="flex justify-between text-xs text-muted-foreground">{record.label}<ChevronRight className="h-3.5 w-3.5" /></div><div className="num text-2xl font-bold">{record.value_formatted}</div><div className="text-caption1 text-muted-foreground">{record.date}</div></Link>)}</div>;
}

export function RecordsCard() {
  return <PageCard title="个人荣誉室"><PersonalRecordsHall /></PageCard>;
}
