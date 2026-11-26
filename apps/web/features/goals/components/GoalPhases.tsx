"use client";

import useSWR from "swr";
import { PageCard } from "@shared/ui/Card";
import { callOrvalValidated } from "@shared/api/orval-adapter";
import { getPeriodizationApiV1PlanPeriodizationGet } from "@shared/api/generated/clients";
import * as Generated from "@shared/api/generated/model";
import { z } from "zod";
import { phaseLabel } from "@features/goals/lib/phase-labels";
import { PlanRevisionsEntry } from "./PlanRevisionsEntry";

export function GoalPhases({
  goalId,
  today,
  onGenerate,
}: {
  goalId: string;
  today: string;
  onGenerate?: () => void;
}) {
  const { data, error, isLoading } = useSWR<Generated.TrainingPhaseResponseOutput[]>(["/plan/periodization", goalId], {
    fetcher: () => callOrvalValidated((fetcher) => getPeriodizationApiV1PlanPeriodizationGet({ goal_id: goalId }, {}, fetcher), z.array(Generated.TrainingPhaseResponse)),
  });
  const phases = data ?? [];
  const weeksOf = (phase: Generated.TrainingPhaseResponseOutput) => Math.max(1, Math.round((new Date(phase.end_date).getTime() - new Date(phase.start_date).getTime()) / 604800000) + 1);
  const totalWeeks = phases.reduce((sum, phase) => sum + weeksOf(phase), 0);
  return <PageCard
    title="训练阶段"
    action={<PlanRevisionsEntry goalId={goalId} />}
  >
    {isLoading ? (
      <p className="text-sm text-muted-foreground">正在读取阶段…</p>
    ) : error ? (
      <p role="alert" className="text-sm text-destructive">{error.message}</p>
    ) : phases.length === 0 ? (
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-muted-foreground">尚未生成训练阶段。生成周期计划后将在此展示各阶段周次与跑量分配。</p>
        {onGenerate ? (
          <button
            type="button"
            onClick={onGenerate}
            className="tactile inline-flex min-h-11 items-center rounded-full border border-border-default px-3.5 text-caption1 font-medium text-accent-strong hover:bg-secondary"
          >
            生成训练计划
          </button>
        ) : null}
      </div>
    ) : (
      <>
        <div className="mb-4 flex h-8 gap-1 overflow-hidden rounded-lg">
          {phases.map((phase, index) => {
            const weeks = weeksOf(phase);
            const done = phase.end_date < today;
            const current = phase.start_date <= today && phase.end_date >= today;
            return (
              <div
                key={phase.phase_id}
                title={`${phaseLabel(phase.name)} ${phase.start_date} – ${phase.end_date}`}
                className={`phase-grow flex min-w-0 items-center justify-center px-1 text-center text-caption1 font-medium ${
                  done ? "bg-secondary text-muted-foreground" : current ? "bg-primary text-primary-foreground" : "bg-secondary/60 text-muted-foreground"
                }`}
                style={{ width: `${(weeks / totalWeeks) * 100}%`, animationDelay: `${index * 45}ms` }}
              >
                <span className="truncate">{phaseLabel(phase.name)}</span>
              </div>
            );
          })}
        </div>
        <div className="space-y-3">
          {phases.map((phase) => {
            const active = phase.start_date <= today && phase.end_date >= today;
            return (
              <div key={phase.phase_id} className="flex items-center gap-3">
                <span className={`h-2 w-2 shrink-0 rounded-full ${active ? "bg-primary" : "bg-secondary"}`} />
                <div className="min-w-0 flex-1">
                  <div className={`text-sm ${active ? "font-semibold text-accent-strong" : ""}`}>
                    {phaseLabel(phase.name)}
                    <span className="num ml-1.5 text-caption1 font-normal text-muted-foreground">({weeksOf(phase)} 周)</span>
                  </div>
                  <div className="num text-caption1 text-muted-foreground">{phase.start_date} – {phase.end_date}</div>
                </div>
                {phase.target_weekly_distance_m != null ? (
                  <span className="num text-xs">{(phase.target_weekly_distance_m / 1000).toFixed(0)} km/周</span>
                ) : null}
              </div>
            );
          })}
        </div>
      </>
    )}
  </PageCard>;
}
