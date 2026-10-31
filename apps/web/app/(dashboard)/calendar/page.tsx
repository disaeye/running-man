"use client";

import { useState } from "react";
import { Dumbbell } from "lucide-react";
import { Page, PageCard, Stat, Segmented } from "@shared/ui/Lovable";
import { Button } from "@shared/ui/button";
import { useActivities } from "@features/activity/hooks/useActivities";
import { useCalendarEvents } from "@features/calendar/hooks/useCalendarEvents";
import { athleteRange, athleteWeekRange, useAthleteTimezone } from "@shared/lib/training-day";
import { CalendarStrengthView } from "@features/calendar/components/CalendarStrengthView";
import { WorkoutBuilderV2 } from "@features/calendar/components/WorkoutBuilderV2";
import { TrainingSummary } from "@features/calendar/components/TrainingSummary";
import { TrainingWeekView } from "@features/calendar/components/TrainingWeekView";
import { TrainingMonthView } from "@features/calendar/components/TrainingMonthView";
import { TrainingActivityList } from "@features/calendar/components/TrainingActivityList";

export function TrainingPageContent() {
  const [view, setView] = useState<"week" | "month" | "list">("week");
  const [sport, setSport] = useState("all");
  const [showLog, setShowLog] = useState(false);
  const [editingDate, setEditingDate] = useState<string | null>(null);
  const timezone = useAthleteTimezone();
  const range = athleteRange(90, timezone);
  const week = athleteWeekRange(timezone);
  const activities = useActivities(range.from, range.to);
  const events = useCalendarEvents(week.from, range.to);
  const filtered = activities.data.filter((activity) => sport === "all" || (sport === "strength" ? getFamily(activity.sport) === "strength" : getFamily(activity.sport) === "running" || getFamily(activity.sport) === "trail"));
  return <Page title="训练" eyebrow="安排与记录">
    <div className="flex flex-wrap gap-2"><Segmented options={[{ value: "all", label: "全部" }, { value: "run", label: "跑步" }, { value: "trail", label: "越野跑" }, { value: "strength", label: "力量" }]} value={sport} onChange={setSport} /></div>
    <TrainingSummary activities={filtered} />
    <PageCard action={<Segmented options={[{ value: "week", label: "周" }, { value: "month", label: "月" }, { value: "list", label: "列表" }]} value={view} onChange={setView} />}>
      {view === "week" ? <TrainingWeekView activities={filtered} events={events.events} timezone={timezone} onSelectDate={setEditingDate} /> : view === "month" ? <TrainingMonthView activities={filtered} events={events.events} timezone={timezone} onSelectDate={setEditingDate} /> : <TrainingActivityList activities={filtered} timezone={timezone} />}
    </PageCard>
    <button type="button" onClick={() => setShowLog(!showLog)} className="surface flex w-full items-center gap-3 p-4 text-left"><Dumbbell className="h-5 w-5 text-accent-strong" /><span className="flex-1 font-medium">力量训练记录</span><Stat label="本范围" value={activities.data.filter((activity) => getFamily(activity.sport) === "strength").length} /><span className="text-xs text-muted-foreground">{showLog ? "收起" : "展开"}</span></button>
    {showLog ? <CalendarStrengthView /> : null}
    <div className="surface space-y-3 p-4"><div className="flex items-center justify-between"><span className="eyebrow">训练编辑</span><Button size="sm" onClick={() => setEditingDate(week.from)}>新建训练</Button></div>{editingDate ? <WorkoutBuilderV2 date={editingDate} onClose={() => setEditingDate(null)} onSave={() => { setEditingDate(null); events.reload(); }} /> : <p className="text-sm text-muted-foreground">点击训练日可编辑安排。</p>}</div>
  </Page>;
}

function getFamily(sport: string) {
  if (sport === "WeightTraining" || sport === "Workout") return "strength";
  if (sport === "TrailRun") return "trail";
  return "running";
}
