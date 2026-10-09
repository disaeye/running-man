"use client";

import { useState, useCallback, useMemo, type FormEvent } from "react";
import { X } from "lucide-react";
import { Button } from "@shared/ui/button";
import { Input } from "@shared/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@shared/ui/select";
import { callOrvalValidated } from "@shared/api/orval-adapter";
import { createEventApiV1CalendarPost, updateEventApiV1CalendarEventIdPut } from "@shared/api/generated/clients";
import * as Generated from "@shared/api/generated/model";
import { WarningBadge } from "@features/calendar/components/WarningBadge";
import { useWorkoutTemplates } from "@features/plan/hooks/useWorkoutTemplates";
import {
  type WorkoutSegment, type CalendarEventDTO, type SegmentType, type TrainingGoal,
  SEGMENT_TYPES, SEGMENT_TYPE_LABEL, TRAINING_GOALS, totalTSS, riskFlags,
} from "@features/calendar/components/types";

interface Props {
  date: string;
  event?: CalendarEventDTO;
  onSave?: () => void;
  onClose?: () => void;
}

let nextId = 0;

function parseSegs(xml?: string): WorkoutSegment[] {
  try { const p = JSON.parse(xml ?? ""); return Array.isArray(p) ? p : []; }
  catch { return []; }
}

interface TemplateItem {
  name: string;
  segs: { segment_type: SegmentType; duration_s: number; power_low: number; power_high: number }[];
}

export function WorkoutBuilderV2({ date, event, onSave, onClose }: Props) {
  const [segs, setSegs] = useState<WorkoutSegment[]>(() => event ? parseSegs(event.workout_xml) : []);
  const [name, setName] = useState(event?.name ?? "");
  const [goal, setGoal] = useState<TrainingGoal>("aerobic-base");
  const [segType, setSegType] = useState<SegmentType>("Warmup");
  const [dur, setDur] = useState("");
  const [pLow, setPLow] = useState("");
  const [pHigh, setPHigh] = useState("");
  const [cad, setCad] = useState("");
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  // Fetched templates (no filter → all), filter client-side by current goal.
  const { templates } = useWorkoutTemplates({});
  const templatesList: TemplateItem[] = useMemo(
    () => templates
      .filter((t) => t.goal_type === goal)
      .map((t) => ({
        name: t.name,
        segs: (t.segments ?? []).map((s) => ({
          segment_type: s.segment_type as SegmentType,
          duration_s: s.duration_s,
          power_low: s.power_low,
          power_high: s.power_high,
        })),
      })),
    [templates, goal],
  );

  const tss = totalTSS(segs);
  const risk = riskFlags(tss);

  const applyTemplate = useCallback((tpl: TemplateItem) => {
    setName(tpl.name);
    setSegs(tpl.segs.map((s) => ({ ...s, id: `t${Date.now()}_${nextId++}` })));
  }, []);

  const addSeg = useCallback((e: FormEvent) => {
    e.preventDefault();
    const d = Number(dur), lo = Number(pLow), hi = Number(pHigh);
    if (!d || !lo || !hi) return;
    const seg: WorkoutSegment = { id: `s${Date.now()}_${nextId++}`, segment_type: segType, duration_s: d, power_low: lo, power_high: hi };
    if (cad) seg.cadence = Number(cad);
    setSegs((p) => [...p, seg]);
    setDur(""); setPLow(""); setPHigh(""); setCad("");
  }, [segType, dur, pLow, pHigh, cad]);

  const handleSave = useCallback(async () => {
    setSaving(true);
    setSaveError(null);
    try {
      const payload = {
        start_time: new Date(date).toISOString(),
        category: "workout",
        name: name || `训练 ${date}`,
        workout_xml: JSON.stringify(segs),
        predicted_tss: tss,
        sport_type: "Run",
      };
      if (event) {
        await callOrvalValidated(
          (f) => updateEventApiV1CalendarEventIdPut(event.event_id, payload, {}, f),
          Generated.CalendarEventOutput,
        );
      } else {
        await callOrvalValidated(
          (f) => createEventApiV1CalendarPost({ event_id: crypto.randomUUID(), ...payload }, {}, f),
          Generated.CalendarEventOutput,
        );
      }
      onSave?.();
    } catch {
      setSaveError("保存失败，请重试");
    } finally {
      setSaving(false);
    }
  }, [date, event, name, segs, tss, onSave]);

  return (
    <div className="flex flex-col gap-4">
      <label className="flex flex-col gap-1">
        <span className="text-subheadline font-medium text-text-secondary">训练名称</span>
        <Input id="wb-name" value={name} onChange={(e) => setName(e.target.value)} placeholder="例: 阈值间歇" />
      </label>

      <label className="flex flex-col gap-1">
        <span className="text-subheadline font-medium text-text-secondary">训练目标</span>
        <Select value={goal} onValueChange={(value) => setGoal(value as TrainingGoal)}>
          <SelectTrigger id="wb-goal" className="w-full">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {TRAINING_GOALS.map((g) => (
              <SelectItem key={g.value} value={g.value}>
                {g.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </label>

      {templatesList.length > 0 && (
        <div className="flex flex-col gap-1">
          <span className="text-caption1 text-text-muted">训练模板</span>
          <div className="flex flex-wrap gap-2">
            {templatesList.map((tpl) => (
              <button key={tpl.name} type="button" onClick={() => applyTemplate(tpl)}
                className="focus-ring rounded-lg border border-border-default bg-surface-card px-3 py-1.5 text-caption1 text-text-primary transition-colors duration-fast hover:bg-surface-overlay">
                {tpl.name}
              </button>
            ))}
          </div>
        </div>
      )}

      <form onSubmit={addSeg} className="flex flex-col gap-3">
        <p className="text-subheadline font-medium text-text-secondary">添加训练段落</p>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
          <label className="flex flex-col gap-1">
            <span className="text-caption1 text-text-muted">类型</span>
            <Select value={segType} onValueChange={(v) => setSegType(v as SegmentType)}>
              <SelectTrigger aria-label="段落类型" className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {SEGMENT_TYPES.map((t) => (
                  <SelectItem key={t} value={t}>{SEGMENT_TYPE_LABEL[t]}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </label>
          <label className="flex flex-col gap-1"><span className="text-caption1 text-text-muted">时长 (秒)</span><Input id="wb-dur" type="number" min={1} value={dur} onChange={(e) => setDur(e.target.value)} /></label>
          <label className="flex flex-col gap-1"><span className="text-caption1 text-text-muted">功率下限 (FTP)</span><Input id="wb-plow" type="number" step={0.01} min={0} max={3} value={pLow} onChange={(e) => setPLow(e.target.value)} /></label>
          <label className="flex flex-col gap-1"><span className="text-caption1 text-text-muted">功率上限 (FTP)</span><Input id="wb-phigh" type="number" step={0.01} min={0} max={3} value={pHigh} onChange={(e) => setPHigh(e.target.value)} /></label>
          <label className="flex flex-col gap-1"><span className="text-caption1 text-text-muted">踏频 (rpm)</span><Input id="wb-cad" type="number" min={0} value={cad} onChange={(e) => setCad(e.target.value)} /></label>
        </div>
        <Button type="submit" variant="secondary">添加段落</Button>
      </form>

      {segs.length > 0 && (
        <div className="flex flex-col gap-1">
          {segs.map((s) => (
            <div key={s.id} className="flex items-center justify-between rounded-lg border border-border-default bg-surface-card px-3 py-2 text-subheadline transition-colors duration-fast">
              <span className="text-text-primary">
                <span className="font-medium text-accent-strong">{SEGMENT_TYPE_LABEL[s.segment_type]}</span>
                {" · "}{s.duration_s}秒 · {s.power_low}–{s.power_high} FTP{s.cadence ? ` · ${s.cadence}rpm` : ""}
              </span>
              <button type="button" onClick={() => setSegs((p) => p.filter((x) => x.id !== s.id))}
                className="focus-ring flex size-11 items-center justify-center rounded-md text-text-muted transition-colors duration-fast hover:text-error" aria-label={`移除 ${SEGMENT_TYPE_LABEL[s.segment_type]} 段落`}>
                <X className="size-4" aria-hidden />
              </button>
            </div>
          ))}
        </div>
      )}

      {saveError && (
        <p className="text-caption1 text-error" role="alert">{saveError}</p>
      )}

      <div className="flex items-center justify-between border-t border-border-default pt-3">
        <div className="flex items-center gap-3">
          <span className="text-subheadline text-text-secondary">预计 TSS: <strong className="text-text-primary tabular-nums">{tss}</strong></span>
          {tss > 0 && <WarningBadge isOvertrainingRisk={risk.isOvertrainingRisk} isHighLoadRisk={risk.isHighLoadRisk} isFresh={risk.isFresh} />}
        </div>
        <div className="flex gap-2">
          {onClose && <Button variant="ghost" onClick={onClose}>取消</Button>}
          <Button onClick={handleSave} disabled={saving || segs.length === 0}>{saving ? "保存中…" : "保存"}</Button>
        </div>
      </div>
    </div>
  );
}
