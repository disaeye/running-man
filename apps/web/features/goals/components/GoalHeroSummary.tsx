"use client";

import { useEffect, useState } from "react";
import { usePersonalRecords } from "@features/performance/hooks/usePersonalRecords";
import { Stat } from "@shared/ui/Lovable";
import { formatDuration } from "@shared/lib/format";
import { apiFetch } from "@shared/lib/api";
import { NO_VALUE } from "@shared/lib/use-data-state";
import type { Goal } from "@shared/types/goals";

interface PredictionResponse {
  predictions: { label: string; distance_m: number; time_s: number }[];
  confidence: string | null;
  data_sufficient: boolean;
}

export function GoalHeroSummary({ goal, days }: { goal: Goal; days: number | null }) {
  const records = usePersonalRecords();
  const [prediction, setPrediction] = useState<PredictionResponse | null>(null);
  const pb = records.data.find((record) => goal.race_distance_m != null && record.type.includes(distanceKey(goal.race_distance_m)))?.value_formatted ?? NO_VALUE;
  const predicted = prediction?.predictions.find((point) => point.distance_m === goal.race_distance_m);
  useEffect(() => {
    let active = true;
    void apiFetch<PredictionResponse>("/race/predict")
      .then((result) => { if (active) setPrediction(result); })
      .catch(() => { if (active) setPrediction(null); });
    return () => { active = false; };
  }, [goal.race_distance_m]);
  return <><div className="flex items-start justify-between"><div><div className="eyebrow">{goal.type === "event" ? "比赛目标" : "训练目标"}</div><h2 className="num mt-1 text-3xl font-bold">{goal.title}</h2><p className="mt-1 text-sm text-muted-foreground">{goal.target_date ?? "尚未设置比赛日期"}{goal.race_distance_m ? ` · ${(goal.race_distance_m / 1000).toFixed(2)} km` : ""}</p></div><div className="text-right"><div className="num text-5xl font-bold text-accent-strong">{days ?? NO_VALUE}</div><div className="text-xs text-muted-foreground">天后</div></div></div>
    <div className="mt-4 grid grid-cols-3 gap-3 rounded-xl bg-background/40 p-3"><Stat label="目标成绩" value={goal.race_target_time_s ? formatDuration(goal.race_target_time_s) : "未设置"} /><Stat label="历史 PB" value={pb} /><Stat label="当前预测" value={predicted ? formatDuration(predicted.time_s) : NO_VALUE} tone={predicted ? "text-warn" : ""} /></div>
    <p className="mt-2 text-caption1 text-muted-foreground">预测基于近期个人最好成绩，实际受路线、天气和补给影响。</p></>;
}

function distanceKey(distance: number) {
  if (distance === 5000) return "5000";
  if (distance === 10000) return "10000";
  if (distance === 21097.5 || distance === 21097) return "half";
  if (distance === 42195) return "marathon";
  return String(distance);
}
