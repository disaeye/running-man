"use client";

import Link from "next/link";
import { Search } from "lucide-react";
import { PageCard, Tag } from "@shared/ui/Lovable";
import { useExercises } from "@features/strength/hooks/useExercises";
import { useStrengthAnalytics } from "@features/strength/hooks/useStrengthAnalytics";
import { listStrengthActivitiesApiV1StrengthWorkoutsGet } from "@shared/api/generated/clients";
import { callOrvalValidated } from "@shared/api/orval-adapter";
import * as Generated from "@shared/api/generated/model";
import { z } from "zod";
import { useEffect, useState } from "react";
import { StrengthWorkoutEditor } from "@features/strength/components/StrengthWorkoutEditor";

export function StrengthOverview() {
  const { data: exercises } = useExercises();
  const analytics = useStrengthAnalytics();
  const muscles = { data: analytics.muscleVolume };
  const e1rm = { data: analytics.e1rm };
  const [query, setQuery] = useState("");
  const [workoutCount, setWorkoutCount] = useState(0);
  const [editorKey, setEditorKey] = useState(0);
  const filtered = exercises.filter((exercise) => `${exercise.name_cn} ${exercise.primary_muscles.join(" ")}`.toLowerCase().includes(query.toLowerCase()));
  const maxVolume = Math.max(1, ...muscles.data.map((item) => item.volume_kg));
  useEffect(() => { void reloadWorkoutCount(); }, []);
  async function reloadWorkoutCount() {
    const today = new Date();
    const from = new Date(today);
    from.setDate(from.getDate() - 3650);
    const rows = await callOrvalValidated((fetcher) => listStrengthActivitiesApiV1StrengthWorkoutsGet({ from_date: from.toISOString().slice(0, 10), to_date: today.toISOString().slice(0, 10) }, {}, fetcher), z.array(Generated.StrengthActivityResponse));
    setWorkoutCount(rows.length);
  }
  return <div className="space-y-4">
    <PageCard><label className="flex items-center gap-2 rounded-lg bg-secondary px-3 py-2"><Search size={16} className="text-muted-foreground" /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="搜索动作（如：深蹲）" className="min-w-0 flex-1 bg-transparent text-sm outline-none" /></label><div className="mt-2 max-h-40 overflow-y-auto">{filtered.slice(0, 10).map((exercise) => <div key={exercise.id} className="flex justify-between border-b py-2 text-sm last:border-0"><span>{exercise.name_cn}</span><span className="text-xs text-muted-foreground">{exercise.primary_muscles.join(" / ")}</span></div>)}</div></PageCard>
    <StrengthWorkoutEditor key={editorKey} onSaved={() => { setEditorKey((key) => key + 1); void reloadWorkoutCount(); }} onClose={() => undefined} />
    <PageCard title="肌群负荷（近 4 周）">{muscles.data.length ? <div className="space-y-3">{muscles.data.map((item) => <div key={item.muscle} className="flex items-center gap-3 text-sm"><span className="w-20">{item.muscle}</span><div className="h-2 flex-1 overflow-hidden rounded-full bg-secondary"><div className="h-full rounded-full bg-primary" style={{ width: `${item.volume_kg / maxVolume * 100}%` }} /></div><span className="num w-20 text-right">{item.volume_kg.toFixed(0)} kg</span></div>)}</div> : <p className="text-sm text-muted-foreground">还没有组次记录。</p>}</PageCard>
    <PageCard title="e1RM 趋势">{e1rm.data.length ? <div className="divide-y">{e1rm.data.map((item) => <Link key={item.exercise_id} href={`/strength/exercises/${item.exercise_id}`} className="flex justify-between py-2 text-sm"><span>{item.exercise_name}</span><span className="num">{item.estimated_1rm_kg.toFixed(1)} kg →</span></Link>)}</div> : <p className="text-sm text-muted-foreground">完成组次记录后显示估算曲线。</p>}</PageCard>
    <div className="flex items-center gap-2 text-caption1 text-muted-foreground"><Tag>{workoutCount} 次力量训练</Tag><Link href="/strength/history" className="text-accent-strong">查看训练历史 →</Link></div>
  </div>;
}
