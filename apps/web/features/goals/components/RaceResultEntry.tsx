"use client";

import { useEffect, useState } from "react";
import { Medal } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@shared/ui/dialog";
import { Button } from "@shared/ui/button";
import { Input } from "@shared/ui/input";
import { callOrval, callOrvalValidated } from "@shared/api/orval-adapter";
import {
  listRaceCandidatesApiV1GoalsGoalIdRaceCandidatesGet,
  recordRaceResultApiV1GoalsGoalIdResultPost,
} from "@shared/api/generated/clients";
import * as Generated from "@shared/api/generated/model";
import { useToast } from "@shared/ui/Toast";
import { getSportConfig } from "@shared/config/sport-config";
import { formatClock, formatDistance } from "@shared/lib/format";
import type { Goal } from "@shared/types/goals";

/** 比赛结案入口：目标日已过且未达成时出现，列出比赛日附近的活动供确认。 */
export function RaceResultEntry({ goal, onRecorded }: { goal: Goal; onRecorded: () => void }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="tactile inline-flex min-h-11 items-center gap-1.5 rounded-full border border-border-default px-3.5 text-caption1 font-medium text-text-primary hover:bg-secondary"
      >
        <Medal className="h-3.5 w-3.5 text-accent-strong" aria-hidden />
        记录比赛结果
      </button>
      {open ? (
        <RaceResultDialog goal={goal} onClose={() => setOpen(false)} onRecorded={onRecorded} />
      ) : null}
    </>
  );
}

function RaceResultDialog({ goal, onClose, onRecorded }: {
  goal: Goal;
  onClose: () => void;
  onRecorded: () => void;
}) {
  const { toast } = useToast();
  const [candidates, setCandidates] = useState<Generated.GoalRaceCandidateOutput[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [manualTime, setManualTime] = useState("");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    let active = true;
    // 初始状态已是 loading=true；对话框只在打开时挂载，无需在 effect 里重复置位。
    callOrvalValidated(
      (fetcher) => listRaceCandidatesApiV1GoalsGoalIdRaceCandidatesGet(goal.goal_id, {}, fetcher),
      Generated.GoalRaceCandidateList,
    )
      .then((result) => {
        if (!active) return;
        setCandidates(result.candidates ?? []);
        setSelectedId(result.candidates?.[0]?.activity_id ?? null);
      })
      .catch((cause: unknown) => {
        if (active) setError(cause instanceof Error ? cause.message : "读取比赛活动失败");
      })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [goal.goal_id]);

  const record = async () => {
    setSaving(true);
    setError(null);
    const finishTime = manualTime ? clockToSeconds(manualTime) : null;
    if (!selectedId && finishTime == null) {
      setError("请选择比赛活动或填写完赛用时。");
      setSaving(false);
      return;
    }
    try {
      await callOrval((fetcher) =>
        recordRaceResultApiV1GoalsGoalIdResultPost(
          goal.goal_id,
          { activity_id: selectedId ?? undefined, finish_time_s: finishTime ?? undefined },
          {},
          fetcher,
        ),
      );
      toast("比赛结果已记录，目标已结案", "success");
      onRecorded();
      onClose();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "记录失败，请重试");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open onOpenChange={(next) => { if (!next && !saving) onClose(); }}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>记录比赛结果</DialogTitle>
        </DialogHeader>
        <div className="flex flex-col gap-4">
          {goal.race_target_time_s != null ? (
            <p className="text-caption1 text-text-secondary">
              目标成绩 {formatClock(goal.race_target_time_s)}；确认后目标结案为已达成。
            </p>
          ) : null}

          {loading ? (
            <p className="text-caption1 text-text-muted">正在读取比赛日附近的活动…</p>
          ) : candidates.length > 0 ? (
            <ul className="space-y-2">
              {candidates.map((candidate) => (
                <li key={candidate.activity_id}>
                  <button
                    type="button"
                    onClick={() => setSelectedId(candidate.activity_id)}
                    aria-pressed={selectedId === candidate.activity_id}
                    className={`tactile flex w-full items-center justify-between gap-3 rounded-xl border p-3 text-left ${
                      selectedId === candidate.activity_id
                        ? "border-accent bg-accent/10"
                        : "border-border-default"
                    }`}
                  >
                    <span>
                      <span className="block text-subheadline font-medium text-text-primary">
                        {candidate.name?.trim() || getSportConfig(candidate.sport).label}
                      </span>
                      <span className="num block text-caption1 text-text-muted">
                        {candidate.start_time.slice(0, 10)}
                        {candidate.distance_m != null ? ` · ${formatDistance(candidate.distance_m)}` : ""}
                        {candidate.duration_s != null ? ` · ${formatClock(candidate.duration_s)}` : ""}
                      </span>
                    </span>
                    {candidate.is_race ? <span className="text-caption1 text-accent-strong">比赛</span> : null}
                  </button>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-caption1 text-text-muted">比赛日 ±1 天内没有匹配的活动，可手动填写完赛用时。</p>
          )}

          <label className="flex flex-col gap-1">
            <span className="text-subheadline font-medium text-text-secondary">完赛用时（可选，格式 hh:mm:ss）</span>
            <Input
              placeholder="例如 1:32:10"
              value={manualTime}
              onChange={(event) => setManualTime(event.target.value)}
            />
          </label>

          {error ? <p role="alert" className="text-caption1 text-error">{error}</p> : null}

          <div className="flex justify-end gap-2">
            <Button type="button" variant="ghost" onClick={onClose} disabled={saving}>取消</Button>
            <Button type="button" onClick={() => void record()} disabled={saving}>
              {saving ? "记录中…" : "确认并结案"}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function clockToSeconds(text: string): number | null {
  const parts = text.split(":").map((part) => Number(part));
  if (parts.some((part) => !Number.isFinite(part))) return null;
  const [hours = 0, minutes = 0, seconds = 0] = parts;
  if (parts.length === 3) return hours * 3600 + minutes * 60 + seconds;
  if (parts.length === 2) return hours * 60 + minutes;
  return parts.length === 1 ? hours : null;
}
