"use client";

import useSWR from "swr";
import { PageCard } from "@shared/ui/Lovable";
import { callOrvalValidated } from "@shared/api/orval-adapter";
import { getPeriodizationApiV1PlanPeriodizationGet } from "@shared/api/generated/clients";
import * as Generated from "@shared/api/generated/model";
import { z } from "zod";

export function GoalPhases({ goalId, today }: { goalId: string; today: string }) {
  const { data, error, isLoading } = useSWR<Generated.TrainingPhaseResponseOutput[]>(["/plan/periodization", goalId], {
    fetcher: () => callOrvalValidated((fetcher) => getPeriodizationApiV1PlanPeriodizationGet({ goal_id: goalId }, {}, fetcher), z.array(Generated.TrainingPhaseResponse)),
  });
  const phases = data ?? [];
  return <PageCard title="训练阶段">{isLoading ? <p className="text-sm text-muted-foreground">正在读取阶段…</p> : error ? <p role="alert" className="text-sm text-destructive">{error.message}</p> : phases.length === 0 ? <p className="text-sm text-muted-foreground">尚未生成训练阶段。</p> : <div className="space-y-3">{phases.map((phase) => { const active = phase.start_date <= today && phase.end_date >= today; return <div key={phase.phase_id} className="flex items-center gap-3"><span className={`h-2 w-2 shrink-0 rounded-full ${active ? "bg-primary" : "bg-secondary"}`} /><div className="min-w-0 flex-1"><div className={`text-sm ${active ? "font-semibold text-accent-strong" : ""}`}>{phase.name}</div><div className="text-caption1 text-muted-foreground">{phase.start_date} – {phase.end_date}</div></div>{phase.target_weekly_distance_m != null ? <span className="num text-xs">{(phase.target_weekly_distance_m / 1000).toFixed(0)} km/周</span> : null}</div>; })}</div>}</PageCard>;
}
