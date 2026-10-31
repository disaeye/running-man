"use client";

import Link from "next/link";
import { useState } from "react";
import { Dumbbell, ChevronRight, Plus, Upload } from "lucide-react";
import { Page, Segmented } from "@shared/ui/Lovable";
import { Button } from "@shared/ui/button";
import { useActivities } from "@features/activity/hooks/useActivities";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@shared/ui/dialog";
import { ImportPanel } from "@features/data/components/ImportPanel";
import { ManualActivityForm } from "@features/activity/components/ManualActivityForm";
import { useCalendarEvents } from "@features/calendar/hooks/useCalendarEvents";
import { athleteRange, athleteWeekRange, useAthleteTimezone } from "@shared/lib/training-day";
import { WorkoutBuilderV2 } from "@features/calendar/components/WorkoutBuilderV2";
import { TrainingSummary } from "@features/calendar/components/TrainingSummary";
import { TrainingWeekView } from "@features/calendar/components/TrainingWeekView";
import { TrainingMonthView } from "@features/calendar/components/TrainingMonthView";
import { TrainingActivityList } from "@features/calendar/components/TrainingActivityList";
import { TrainingSubjective } from "@features/calendar/components/TrainingSubjective";
import { useWellness } from "@features/health/hooks/useWellness";
import { activityLocalDay, athleteToday } from "@shared/lib/training-day";

export default function TrainingPageContent() {
  const [view, setView] = useState<"week" | "month" | "list">("week");
  const [sport, setSport] = useState("all");
  const [editingDate, setEditingDate] = useState<string | null>(null);
  const [importOpen, setImportOpen] = useState(false);
  const [manualOpen, setManualOpen] = useState(false);
  const timezone = useAthleteTimezone();
  const range = athleteRange(90, timezone);
  const week = athleteWeekRange(timezone);
  const activities = useActivities(range.from, range.to);
  const events = useCalendarEvents(week.from, range.to);
  const today = athleteToday(timezone);
  const wellness = useWellness(today, today);
  const todayEvent = events.events.find((event) => activityLocalDay(event.start_time, timezone) === today) ?? null;
  const filtered = activities.data.filter((activity) => sport === "all" || getFamily(activity.sport) === sport);
  return <Page title="训练" eyebrow={`${week.from} – ${week.to}`} right={<div className="flex gap-2"><button type="button" onClick={() => setImportOpen(true)} className="rounded-full bg-secondary p-2" aria-label="导入文件"><Upload className="h-4 w-4" /></button><button type="button" onClick={() => setManualOpen(true)} className="rounded-full bg-primary p-2 text-primary-foreground" aria-label="手动添加"><Plus className="h-4 w-4" /></button></div>}>
    <div className="flex flex-wrap gap-2"><Segmented options={[{ value: "all", label: "全部" }, { value: "running", label: "跑步" }, { value: "trail", label: "越野跑" }, { value: "strength", label: "力量" }]} value={sport} onChange={setSport} /></div>
    <TrainingSummary activities={filtered} />
    <Segmented options={[{ value: "week", label: "周" }, { value: "month", label: "月" }, { value: "list", label: "列表" }]} value={view} onChange={setView} />
    <div>
      {view === "week" ? <TrainingWeekView activities={filtered} events={events.events} timezone={timezone} onSelectDate={setEditingDate} /> : view === "month" ? <TrainingMonthView activities={filtered} events={events.events} timezone={timezone} onSelectDate={setEditingDate} /> : <TrainingActivityList activities={filtered} timezone={timezone} />}
    </div>
    <TrainingSubjective event={todayEvent} wellness={wellness.data[0] ?? null} day={today} onSaved={() => { events.reload(); wellness.reload(); }} />
    <Link href="/strength" className="surface flex items-center gap-3 p-4"><Dumbbell className="h-6 w-6 text-accent-strong" /><div className="flex-1"><div className="font-semibold">力量训练</div><div className="text-xs text-muted-foreground">日志、动作库、肌群负荷与 e1RM 趋势</div></div><ChevronRight className="h-5 w-5 text-muted-foreground" /></Link>
    <Dialog open={importOpen} onOpenChange={setImportOpen}><DialogContent><DialogHeader><DialogTitle>导入训练文件</DialogTitle></DialogHeader><ImportPanel /></DialogContent></Dialog>
    <Dialog open={manualOpen} onOpenChange={setManualOpen}><DialogContent><DialogHeader><DialogTitle>手动记录训练</DialogTitle></DialogHeader><ManualActivityForm onSaved={() => { setManualOpen(false); activities.reload(); }} /></DialogContent></Dialog>
    <div className="surface space-y-3 p-4"><div className="flex items-center justify-between"><span className="eyebrow">训练编辑</span><Button size="sm" onClick={() => setEditingDate(week.from)}>新建训练</Button></div>{editingDate ? <WorkoutBuilderV2 date={editingDate} onClose={() => setEditingDate(null)} onSave={() => { setEditingDate(null); events.reload(); }} /> : <p className="text-sm text-muted-foreground">点击训练日可编辑安排。</p>}</div>
  </Page>;
}

function getFamily(sport: string) {
  if (sport === "WeightTraining" || sport === "Workout") return "strength";
  if (sport === "TrailRun") return "trail";
  return "running";
}
