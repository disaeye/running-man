"use client";

import { useState } from "react";
import Link from "next/link";
import { Target, Trophy } from "lucide-react";
import { Page, PageCard, Stat, Tag } from "@shared/ui/Lovable";
import { NO_VALUE } from "@shared/lib/use-data-state";
import { Button } from "@shared/ui/button";
import { useGoals, useGoal, createMilestone, updateMilestone, toggleMilestone } from "@features/goals/hooks/useGoals";
import { GoalForm } from "@features/goals/components/GoalForm";
import { MilestoneList } from "@features/goals/components/MilestoneList";
import { PersonalRecordsHall } from "@features/goals/components/PersonalRecordsHall";
import { GoalLoadForecast } from "@features/goals/components/GoalLoadForecast";
import { GoalPhases } from "@features/goals/components/GoalPhases";
import { usePlanAdjustments } from "@features/goals/hooks/usePlanAdjustments";
import { GoalAdjustments } from "@features/goals/components/GoalAdjustments";
import { useAthleteTimezone, athleteToday } from "@shared/lib/training-day";
import { formatDuration } from "@shared/lib/format";

export default function GoalsPage() {
  const { goals } = useGoals();
  const active = goals.find((goal) => goal.status === "active") ?? null;
  return <Page title="目标" eyebrow="比赛与里程碑">{active ? <GoalDetail goalId={active.goal_id} /> : <EmptyGoal />}</Page>;
}

function EmptyGoal() {
  const [open, setOpen] = useState(false);
  return <PageCard><div className="py-6 text-center"><Target className="mx-auto h-8 w-8 text-muted-foreground" /><h2 className="mt-3 font-semibold">还没有进行中的目标</h2><p className="mt-1 text-sm text-muted-foreground">创建比赛或训练目标后，这里会显示里程碑与预测。</p><Button className="mt-4" onClick={() => setOpen(true)}>创建目标</Button></div><GoalForm open={open} onClose={() => setOpen(false)} onSubmit={() => { setOpen(false); window.location.reload(); }} /></PageCard>;
}

function GoalDetail({ goalId }: { goalId: string }) {
  const { goal, milestones, refresh } = useGoal(goalId);
  const timezone = useAthleteTimezone();
  const adjustments = usePlanAdjustments();
  const days = goal?.target_date ? Math.max(0, Math.ceil((new Date(goal.target_date).getTime() - new Date(athleteToday(timezone)).getTime()) / 86400000)) : null;
  if (!goal) return null;
  return <div className="space-y-4"><PageCard hero><div className="flex items-start justify-between"><div><Tag tone="primary">主目标</Tag><h2 className="mt-2 text-xl font-bold">{goal.title}</h2><p className="mt-1 text-sm text-muted-foreground">{goal.target_date ?? "尚未设置比赛日期"}{goal.race_distance_m ? ` · ${(goal.race_distance_m / 1000).toFixed(2)} km` : ""}</p></div><div className="text-right"><div className="num text-5xl font-bold text-accent-strong">{days ?? NO_VALUE}</div><div className="text-xs text-muted-foreground">天后</div></div></div><div className="mt-4 grid grid-cols-3 gap-3"><Stat label="目标成绩" value={goal.race_target_time_s ? formatDuration(goal.race_target_time_s) : "未设置"} /><Stat label="当前进度" value={goal.current_value ?? NO_VALUE} /><Stat label="目标单位" value={goal.unit ?? "比赛"} /></div></PageCard>{goal.target_date ? <GoalPhases goalId={goalId} today={athleteToday(timezone)} /> : null}<PageCard title="里程碑"><MilestoneList milestones={milestones} goalUnit={goal.unit} onToggle={async (id) => { await toggleMilestone(goalId, id, !milestones.find((m) => m.milestone_id === id)?.achieved); await refresh(); }} onSave={async (id, draft) => { if (id) await updateMilestone(goalId, id, draft); else await createMilestone(goalId, draft); await refresh(); }} /></PageCard><GoalLoadForecast today={athleteToday(timezone)} targetDate={goal.target_date} timezone={timezone} /><GoalAdjustments adjustments={adjustments.data} onDecided={adjustments.reload} /><PageCard title="个人荣誉室" action={<Trophy className="h-4 w-4 text-warn" />}><PersonalRecordsHall /></PageCard><div className="flex justify-end"><Link href="/settings?section=profile" className="text-xs text-accent-strong">管理目标</Link></div></div>;
}
