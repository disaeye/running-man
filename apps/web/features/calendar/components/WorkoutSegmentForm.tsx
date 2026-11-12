"use client";

import { useState, type FormEvent } from "react";
import { Button } from "@shared/ui/button";
import { Input } from "@shared/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@shared/ui/select";
import {
  SEGMENT_TYPES,
  SEGMENT_TYPE_LABEL,
  type SegmentType,
} from "@features/calendar/components/types";
import {
  parsePaceInput,
  type BuilderSegment,
} from "@features/calendar/lib/workout-prescription";

let nextSegmentId = 0;

interface Props {
  readonly isRun: boolean;
  readonly onAdd: (segment: BuilderSegment) => void;
}

export function WorkoutSegmentForm({ isRun, onAdd }: Props) {
  const [segType, setSegType] = useState<SegmentType>(isRun ? "SteadyState" : "SteadyState");
  const [durMin, setDurMin] = useState("");
  const [durSec, setDurSec] = useState("");
  const [reps, setReps] = useState("4");
  const [recMin, setRecMin] = useState("1");
  const [recSec, setRecSec] = useState("30");
  const [paceMinText, setPaceMinText] = useState("");
  const [paceMaxText, setPaceMaxText] = useState("");
  const [formError, setFormError] = useState<string | null>(null);

  const handleSubmit = (e: FormEvent) => {
    e.preventDefault();
    setFormError(null);
    const totalSec = Math.round(Number(durMin || 0) * 60 + Number(durSec || 0));
    if (!Number.isFinite(totalSec) || totalSec <= 0) {
      setFormError("请填写大于 0 的分段时长。");
      return;
    }

    let paceMin: number | null = null;
    let paceMax: number | null = null;
    if (isRun) {
      const pMin = parsePaceInput(paceMinText);
      if (!pMin.ok) {
        setFormError(pMin.error);
        return;
      }
      const pMax = parsePaceInput(paceMaxText);
      if (!pMax.ok) {
        setFormError(pMax.error);
        return;
      }
      paceMin = pMin.value;
      paceMax = pMax.value ?? pMin.value;
      if (paceMin != null && paceMax != null && paceMin > paceMax) {
        setFormError("最快配速（较小秒数）不能慢于最慢配速。");
        return;
      }
    }

    const isInterval = segType === "IntervalsT";
    const repCount = isInterval ? Math.max(1, Math.round(Number(reps || 1))) : null;
    const recoveryTotalSec = isInterval
      ? Math.max(0, Math.round(Number(recMin || 0) * 60 + Number(recSec || 0)))
      : null;

    onAdd({
      id: `seg-${Date.now()}-${nextSegmentId++}`,
      segment_type: segType,
      duration_s: totalSec,
      pace_min_s_km: paceMin,
      pace_max_s_km: paceMax,
      repetitions: repCount,
      recovery_s: recoveryTotalSec && recoveryTotalSec > 0 ? recoveryTotalSec : null,
    });

    setDurMin("");
    setDurSec("");
    setPaceMinText("");
    setPaceMaxText("");
  };

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-3 rounded-xl bg-surface-overlay/50 p-3">
      <p className="text-caption1 font-medium text-text-secondary">添加训练段落</p>
      <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
        <label className="flex flex-col gap-1">
          <span className="text-caption1 text-text-muted">段落类型</span>
          <Select value={segType} onValueChange={(v) => setSegType(v as SegmentType)}>
            <SelectTrigger aria-label="段落类型" className="min-h-11 w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {SEGMENT_TYPES.map((t) => (
                <SelectItem key={t} value={t}>{SEGMENT_TYPE_LABEL[t]}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </label>
        <div className="flex flex-col gap-1">
          <span className="text-caption1 text-text-muted">
            {segType === "IntervalsT" ? "单组时长（分 : 秒）" : "时长（分 : 秒）"}
          </span>
          <div className="grid grid-cols-2 gap-2">
            <Input
              id="wb-dur-min"
              aria-label="时长分钟"
              type="number"
              min={0}
              max={600}
              placeholder="分"
              value={durMin}
              onChange={(e) => setDurMin(e.target.value)}
            />
            <Input
              id="wb-dur-sec"
              aria-label="时长秒"
              type="number"
              min={0}
              max={59}
              placeholder="秒"
              value={durSec}
              onChange={(e) => setDurSec(e.target.value)}
            />
          </div>
        </div>
      </div>

      {segType === "IntervalsT" ? (
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
          <label className="flex flex-col gap-1">
            <span className="text-caption1 text-text-muted">重复组数</span>
            <Input
              id="wb-reps"
              aria-label="重复组数"
              type="number"
              min={1}
              max={50}
              value={reps}
              onChange={(e) => setReps(e.target.value)}
            />
          </label>
          <div className="flex flex-col gap-1">
            <span className="text-caption1 text-text-muted">组间恢复（分 : 秒）</span>
            <div className="grid grid-cols-2 gap-2">
              <Input
                id="wb-rec-min"
                aria-label="恢复分钟"
                type="number"
                min={0}
                max={60}
                placeholder="分"
                value={recMin}
                onChange={(e) => setRecMin(e.target.value)}
              />
              <Input
                id="wb-rec-sec"
                aria-label="恢复秒"
                type="number"
                min={0}
                max={59}
                placeholder="秒"
                value={recSec}
                onChange={(e) => setRecSec(e.target.value)}
              />
            </div>
          </div>
        </div>
      ) : null}

      {isRun ? (
        <div className="grid grid-cols-2 gap-2">
          <label className="flex flex-col gap-1">
            <span className="text-caption1 text-text-muted">目标最快配速 (/km)</span>
            <Input
              id="wb-pace-min"
              placeholder="例 4:25"
              value={paceMinText}
              onChange={(e) => setPaceMinText(e.target.value)}
            />
          </label>
          <label className="flex flex-col gap-1">
            <span className="text-caption1 text-text-muted">目标最慢配速 (/km)</span>
            <Input
              id="wb-pace-max"
              placeholder="例 4:40"
              value={paceMaxText}
              onChange={(e) => setPaceMaxText(e.target.value)}
            />
          </label>
        </div>
      ) : null}

      {formError ? <p role="alert" className="text-caption1 text-error">{formError}</p> : null}
      <Button type="submit" variant="secondary" className="min-h-11">添加段落</Button>
    </form>
  );
}
