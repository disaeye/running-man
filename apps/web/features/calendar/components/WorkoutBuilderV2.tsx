"use client";

import { useState, useCallback, useMemo } from "react";
import { Trash2, X } from "lucide-react";
import { Button } from "@shared/ui/button";
import { Input } from "@shared/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@shared/ui/select";
import { useToast } from "@shared/ui/Toast";
import { useAthleteTimezone } from "@shared/lib/training-day";
import { callOrval, callOrvalValidated } from "@shared/api/orval-adapter";
import {
  createEventApiV1CalendarPost,
  deleteEventApiV1CalendarEventIdDelete,
  updateEventApiV1CalendarEventIdPut,
} from "@shared/api/generated/clients";
import * as Generated from "@shared/api/generated/model";
import { useWorkoutTemplates } from "@features/plan/hooks/useWorkoutTemplates";
import { getSportConfig } from "@shared/config/sport-config";
import { type CalendarEventDTO, type TrainingGoal, SEGMENT_TYPE_LABEL, TRAINING_GOALS } from "@features/calendar/components/types";
import { athleteDayStartIso } from "@features/calendar/lib/view-range";
import {
  builderSegmentFromTemplate, buildWorkoutPrescriptionPayload,
  formatPaceInput, formatSegmentDuration, segmentsFromEvent, totalBuilderSeconds,
  trainingTypeToGoal, type BuilderSegment,
} from "@features/calendar/lib/workout-prescription";
import { WorkoutSegmentForm } from "./WorkoutSegmentForm";

const SPORT_CHOICES = ["Run", "VirtualRun", "TrailRun", "Workout"] as const;

interface Props {
  readonly date: string;
  readonly allowDateEdit?: boolean;
  readonly defaultSport?: string;
  readonly event?: CalendarEventDTO;
  readonly onSave?: () => void;
  readonly onClose?: () => void;
}

let tplNextId = 0;

export function WorkoutBuilderV2({
  date, allowDateEdit = false, defaultSport = "Run", event, onSave, onClose,
}: Props) {
  const { toast, toastWithAction } = useToast();
  const timezone = useAthleteTimezone();
  const [selectedDate, setSelectedDate] = useState(date);
  const [sportType, setSportType] = useState(event?.sport_type ?? defaultSport);
  const [segs, setSegs] = useState<BuilderSegment[]>(() => segmentsFromEvent(event));
  const [name, setName] = useState(event?.name ?? "");
  const [goal, setGoal] = useState<TrainingGoal>(() =>
    trainingTypeToGoal(event?.training_type ?? event?.workout_prescription?.type),
  );
  const [saving, setSaving] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  const isRun = getSportConfig(sportType).isRun;
  const { templates } = useWorkoutTemplates({});
  const templatesList = useMemo(
    () => templates.filter((t) => t.goal_type === goal).map((t) => ({
      name: t.name,
      segs: (t.segments ?? []).map((s, idx) => builderSegmentFromTemplate(s, `tpl-${tplNextId++}-${idx}`)),
    })),
    [templates, goal],
  );
  const totalMinutes = Math.round(totalBuilderSeconds(segs) / 60);

  const handleSave = useCallback(async () => {
    setSaving(true);
    setSaveError(null);
    try {
      const built = buildWorkoutPrescriptionPayload({ date: selectedDate, name, goal, sportType, segments: segs });
      const payload = {
        start_time: athleteDayStartIso(selectedDate, timezone),
        category: "workout",
        name: built.name,
        sport_type: built.sportType,
        training_type: built.trainingType,
        predicted_tss: event?.predicted_tss ?? null,
        predicted_distance_m: built.predictedDistanceM,
        workout_prescription: built.prescription,
        workout_xml: built.workoutXml,
      };
      if (event) {
        await callOrvalValidated((f) => updateEventApiV1CalendarEventIdPut(event.event_id, payload, {}, f), Generated.CalendarEventOutput);
        toast("训练计划已更新", "success");
      } else {
        await callOrvalValidated((f) => createEventApiV1CalendarPost({ event_id: crypto.randomUUID(), ...payload }, {}, f), Generated.CalendarEventOutput);
        toast("训练计划已保存", "success");
      }
      onSave?.();
    } catch {
      setSaveError("保存失败，请重试");
    } finally {
      setSaving(false);
    }
  }, [selectedDate, timezone, event, goal, name, segs, sportType, onSave, toast]);

  // 删除立即执行，toast 如实说「已删除」；撤销按钮在 5 秒内按快照重建事件。
  // 快照重建走重建接口，所以这个动作叫「重录恢复」而不是「撤销」。
  const handleDelete = useCallback(async () => {
    if (!event) return;
    setSaving(true);
    setSaveError(null);
    try {
      await callOrval((f) => deleteEventApiV1CalendarEventIdDelete(event.event_id, {}, f));
      onSave?.();
      toastWithAction(
        `训练计划「${event.name}」已删除。`,
        "warning",
        {
          label: "重录恢复",
          onClick: async () => {
            try {
              await callOrvalValidated(
                (f) => createEventApiV1CalendarPost(
                  {
                    event_id: event.event_id,
                    start_time: event.start_time,
                    category: event.category,
                    name: event.name,
                    sport_type: event.sport_type,
                    training_type: event.training_type,
                    predicted_tss: event.predicted_tss ?? null,
                    predicted_distance_m: event.predicted_distance_m ?? null,
                    workout_prescription: event.workout_prescription ?? null,
                    workout_xml: event.workout_xml ?? null,
                  },
                  {},
                  f,
                ),
                Generated.CalendarEventOutput,
              );
              onSave?.();
              toast("已恢复，训练计划重新入列", "success");
            } catch {
              toast(`训练计划「${event.name}」恢复失败，请重录`, "error");
            }
          },
        },
        5000,
      );
    } catch {
      setSaveError("删除失败，请重试");
    } finally {
      setSaving(false);
    }
  }, [event, onSave, toast, toastWithAction]);

  return (
    <div className="flex flex-col gap-4">
      {allowDateEdit ? (
        <label className="flex flex-col gap-1">
          <span className="text-caption1 font-medium text-text-secondary">计划日期</span>
          <Input id="wb-date" type="date" value={selectedDate} onChange={(e) => setSelectedDate(e.target.value)} required />
        </label>
      ) : null}

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <label className="flex flex-col gap-1">
          <span className="text-caption1 font-medium text-text-secondary">运动项目</span>
          <Select value={sportType} onValueChange={setSportType}>
            <SelectTrigger id="wb-sport" className="min-h-11 w-full"><SelectValue /></SelectTrigger>
            <SelectContent>
              {SPORT_CHOICES.map((value) => (
                <SelectItem key={value} value={value}>{getSportConfig(value).label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </label>
        <label className="flex flex-col gap-1">
          <span className="text-caption1 font-medium text-text-secondary">训练名称</span>
          <Input id="wb-name" value={name} onChange={(e) => setName(e.target.value)} placeholder={isRun ? "例：阈值间歇" : "例：下肢力量"} />
        </label>
      </div>

      {isRun ? (
        <>
          <label className="flex flex-col gap-1">
            <span className="text-caption1 font-medium text-text-secondary">训练目标</span>
            <Select value={goal} onValueChange={(value) => setGoal(value as TrainingGoal)}>
              <SelectTrigger id="wb-goal" className="min-h-11 w-full"><SelectValue /></SelectTrigger>
              <SelectContent>
                {TRAINING_GOALS.map((g) => <SelectItem key={g.value} value={g.value}>{g.label}</SelectItem>)}
              </SelectContent>
            </Select>
          </label>
          {templatesList.length > 0 ? (
            <div className="flex flex-col gap-1">
              <span className="text-caption1 text-text-muted">快速套用模板</span>
              <div className="flex flex-wrap gap-2">
                {templatesList.map((tpl) => (
                  <button key={tpl.name} type="button" onClick={() => { setName(tpl.name); setSegs(tpl.segs); }}
                    className="tactile min-h-11 rounded-lg bg-surface-overlay/50 px-3 text-caption1 text-text-primary hover:bg-secondary">
                    {tpl.name}
                  </button>
                ))}
              </div>
            </div>
          ) : null}
        </>
      ) : null}

      <WorkoutSegmentForm isRun={isRun} onAdd={(seg) => setSegs((prev) => [...prev, seg])} />

      {segs.length > 0 ? (
        <div className="flex flex-col gap-1.5" data-testid="wb-segments">
          {segs.map((s) => (
            <div key={s.id} className="flex items-center justify-between rounded-lg bg-surface-overlay/50 px-3 py-2 text-caption1">
              <span className="num text-text-primary">
                <span className="font-medium text-accent-strong">{SEGMENT_TYPE_LABEL[s.segment_type]}</span>
                {s.repetitions && s.repetitions > 1 ? ` × ${s.repetitions} 组` : ""} · {formatSegmentDuration(s.duration_s)}
                {s.pace_min_s_km != null ? ` · ${formatPaceInput(s.pace_min_s_km)}–${formatPaceInput(s.pace_max_s_km ?? s.pace_min_s_km)}/km` : ""}
                {s.repetitions && s.repetitions > 1 && s.recovery_s ? `（恢复 ${formatSegmentDuration(s.recovery_s)}）` : ""}
              </span>
              <button type="button" onClick={() => setSegs((p) => p.filter((x) => x.id !== s.id))}
                className="flex size-11 shrink-0 items-center justify-center rounded-md text-text-muted hover:text-error"
                aria-label={`移除 ${SEGMENT_TYPE_LABEL[s.segment_type]} 段落`}>
                <X className="size-4" aria-hidden />
              </button>
            </div>
          ))}
        </div>
      ) : null}

      {saveError ? <p className="text-caption1 text-error" role="alert">{saveError}</p> : null}

      <div className="flex flex-wrap items-center justify-between gap-2 border-t border-border-default pt-3">
        <span className="text-subheadline text-text-secondary">
          预计时长：<strong className="num text-text-primary">{totalMinutes} 分钟</strong>
        </span>
        <div className="flex flex-wrap items-center gap-2">
          {event ? (
            confirmDelete ? (
              <Button type="button" variant="destructive" size="sm" disabled={saving} onClick={() => void handleDelete()} className="min-h-11">确认删除</Button>
            ) : (
              <Button type="button" variant="ghost" size="sm" disabled={saving} onClick={() => setConfirmDelete(true)} className="min-h-11 text-error">
                <Trash2 className="mr-1 size-4" aria-hidden />删除
              </Button>
            )
          ) : null}
          {onClose ? <Button type="button" variant="ghost" onClick={onClose} className="min-h-11">取消</Button> : null}
          <Button type="button" onClick={() => void handleSave()} disabled={saving || segs.length === 0} className="min-h-11">
            {saving ? "保存中…" : "保存计划"}
          </Button>
        </div>
      </div>
    </div>
  );
}
