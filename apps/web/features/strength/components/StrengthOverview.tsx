"use client";

import { useState } from "react";
import { Search, Plus } from "lucide-react";
import { PageCard } from "@shared/ui/Lovable";
import { useExercises } from "@features/strength/hooks/useExercises";
import { useStrengthAnalytics } from "@features/strength/hooks/useStrengthAnalytics";
import { StrengthWorkoutEditor } from "@features/strength/components/StrengthWorkoutEditor";

export function StrengthOverview() {
  const [query, setQuery] = useState("");
  const [libraryOpen, setLibraryOpen] = useState(false);
  const [editorOpen, setEditorOpen] = useState(false);
  const exercises = useExercises(query);
  const [editorKey, setEditorKey] = useState(0);
  const analytics = useStrengthAnalytics();
  return <><div className="flex gap-2"><div className="flex flex-1 items-center gap-2 rounded-full bg-secondary px-3"><Search className="h-4 w-4 text-muted-foreground" /><input aria-label="搜索动作" value={query} onChange={(event) => { setQuery(event.target.value); setLibraryOpen(true); }} placeholder="搜索动作（如：深蹲）" className="min-w-0 flex-1 bg-transparent py-2.5 text-sm outline-none" /></div><button type="button" onClick={() => { setEditorOpen(true); setEditorKey((key) => key + 1); }} className="flex items-center gap-1 rounded-full bg-primary px-4 text-sm font-semibold text-primary-foreground"><Plus className="h-4 w-4" />记力量</button></div>{editorOpen ? <PageCard title="记录力量训练"><StrengthWorkoutEditor key={editorKey} onClose={() => setEditorOpen(false)} onSaved={() => { setEditorOpen(false); window.location.reload(); }} /></PageCard> : null}{libraryOpen ? <PageCard title={`动作库 · ${exercises.data.length} 项`}><div className="grid grid-cols-2 gap-2">{exercises.data.map((exercise) => <div key={exercise.id} className="rounded-xl bg-secondary p-3"><div className="text-sm font-medium">{exercise.name_cn}</div><div className="text-caption1 text-muted-foreground">{exercise.primary_muscles.join(" · ")}</div></div>)}</div></PageCard> : null}<PageCard title="肌群负荷"><div className="space-y-2">{analytics.muscleVolume.length ? analytics.muscleVolume.map((item) => <div key={item.muscle} className="flex justify-between text-xs"><span>{item.muscle}</span><span className="num">{item.volume_kg.toFixed(0)} kg</span></div>) : <p className="text-sm text-muted-foreground">暂无肌群训练量</p>}</div></PageCard><PageCard title="e1RM 估算"><div className="space-y-2">{analytics.e1rm.length ? analytics.e1rm.slice(0, 5).map((item) => <div key={`${item.exercise_id}-${item.date}`} className="flex justify-between text-sm"><span>{item.exercise_name}</span><span className="num">{item.estimated_1rm_kg.toFixed(1)} kg</span></div>) : <p className="text-sm text-muted-foreground">记录动作与组数后生成 e1RM 估算。</p>}</div></PageCard></>;
}
