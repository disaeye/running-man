"use client";

import { useEffect, useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@shared/ui/dialog";
import { Button } from "@shared/ui/button";
import { Input } from "@shared/ui/input";
import { apiFetch } from "@shared/lib/api";
import type { Goal, GoalStatus, GoalType } from "@shared/types/goals";
import { EventFields, WeightFields, AccumulationFields, TypeSelector, typePatch, type GoalFormData, type FormPatch } from "./goal-form-fields";

export type { GoalFormData } from "./goal-form-fields";

interface GoalFormProps {  open: boolean;
  onClose: () => void;
  onSubmit: (data: GoalFormData) => Promise<void>;
  editingGoal?: Goal | null;
  submitting?: boolean;
  submitError?: string | null;
}

export function GoalForm({ open, onClose, onSubmit, editingGoal, submitting, submitError }: GoalFormProps) {
  return (
    <Dialog open={open} onOpenChange={(next) => { if (!next && !submitting) onClose(); }}>
      <DialogContent className="max-h-[calc(100dvh-2rem)] overflow-y-auto" mobileSheet>
        <DialogHeader>
          <DialogTitle>{editingGoal ? "编辑目标" : "创建目标"}</DialogTitle>
        </DialogHeader>
        {open ? (
          <GoalFormFields
            key={editingGoal?.goal_id ?? "create"}
            editingGoal={editingGoal ?? null}
            onClose={onClose}
            onSubmit={onSubmit}
            submitting={submitting ?? false}
            submitError={submitError ?? null}
          />
        ) : null}
      </DialogContent>
    </Dialog>
  );
}

function defaults(): GoalFormData {
  return {
    type: "event", title: "", target_value: null, current_value: 0, unit: null,
    start_date: null, sport_key: "run", is_primary: false, baseline_value: null,
    direction: "increase", target_date: null, race_distance_m: null,
    race_target_time_s: null, status: "active",
  };
}

function fromGoal(goal: Goal): GoalFormData {
  return {
    type: goal.type, title: goal.title, target_value: goal.target_value,
    current_value: goal.current_value, unit: goal.unit, start_date: goal.start_date,
    sport_key: goal.sport_key ?? "run", is_primary: goal.is_primary,
    baseline_value: goal.baseline_value, direction: goal.direction,
    target_date: goal.target_date, race_distance_m: goal.race_distance_m,
    race_target_time_s: goal.race_target_time_s, status: goal.status,
  };
}

function GoalFormFields({ editingGoal, onClose, onSubmit, submitting, submitError }: Omit<GoalFormProps, "open"> & { submitting: boolean; submitError: string | null }) {
  const [form, setForm] = useState<GoalFormData>(editingGoal ? fromGoal(editingGoal) : defaults());
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [latestWeight, setLatestWeight] = useState<number | null>(null);

  useEffect(() => {
    if (editingGoal || latestWeight != null) return;
    let active = true;
    void apiFetch<{ entries: { weight_kg: number }[] }>("/weight", { params: { from: "2020-01-01", to: new Date().toISOString().slice(0, 10) } })
      .then((result) => {
        if (active && result.entries.length > 0) {
          const latest = result.entries[0];
          if (latest) setLatestWeight(latest.weight_kg);
        }
      })
      .catch(() => { /* 没有体重记录时留空，由用户输入 */ });
    return () => { active = false; };
  }, [editingGoal, latestWeight]);

  const update = (patch: FormPatch) => {
    setForm((prev) => ({ ...prev, ...patch }));
    setErrors({});
  };

  const raceSeconds = form.race_target_time_s ?? null;
  const targetPace = raceSeconds && form.race_distance_m
    ? raceSeconds / (form.race_distance_m / 1000) : null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const errs: Record<string, string> = {};
    if (!form.title.trim()) errs.title = "请输入目标标题";
    if (form.type === "event") {
      if (!form.race_distance_m) errs.race = "请选择或填写比赛距离";
      if (!raceSeconds || raceSeconds <= 0) errs.race = "请填写目标完赛用时";
      if (!form.target_date) errs.date = "比赛目标需要比赛日期";
    } else if (form.type === "weight") {
      if (!form.baseline_value) errs.baseline = "请填写当前体重";
      if (!form.target_value) errs.value = "请填写目标体重";
    } else {
      if (!form.target_value || form.target_value <= 0) errs.value = "请填写目标数值";
    }
    if (Object.keys(errs).length > 0) { setErrors(errs); return; }
    await onSubmit({
      ...form,
      title: form.title.trim(),
      target_value: form.type === "event" ? null : form.target_value,
      unit: form.type === "event" ? null : unitFor(form.type, form.unit),
      direction: form.type === "weight" ? "decrease" : "increase",
    });
  };

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-4">
      <div>
        <span className="text-subheadline font-medium text-text-secondary">目标类型</span>
        <TypeSelector current={form.type} onSelect={(value) => update(typePatch(value))} />
      </div>

      <label className="flex flex-col gap-1">
        <span className="text-subheadline font-medium text-text-secondary">目标名称</span>
        <Input value={form.title} onChange={(e) => update({ title: e.target.value })} placeholder="例如：10K 破 45 分" aria-invalid={Boolean(errors.title)} />
        {errors.title && <span className="text-caption1 text-error">{errors.title}</span>}
      </label>

      {form.type === "event" ? (
        <EventFields form={form} update={update} errors={errors} targetPace={targetPace} />
      ) : form.type === "weight" ? (
        <WeightFields form={form} update={update} errors={errors} latestWeight={latestWeight} />
      ) : (
        <AccumulationFields form={form} update={update} errors={errors} />
      )}

      <label className="flex flex-col gap-1">
        <span className="text-subheadline font-medium text-text-secondary">{form.type === "event" ? "比赛日期" : "目标日期"}</span>
        <Input type="date" value={form.target_date ?? ""} onChange={(e) => update({ target_date: e.target.value || null })} />
        {errors.date && <span className="text-caption1 text-error">{errors.date}</span>}
      </label>

      {editingGoal ? (
        <label className="flex flex-col gap-1">
          <span className="text-subheadline font-medium text-text-secondary">目标状态</span>
          <select value={form.status} onChange={(e) => update({ status: e.target.value as GoalStatus })}
            className="min-h-11 rounded-lg border border-border-default bg-surface-card px-3 text-subheadline">
            <option value="active">进行中</option>
            <option value="achieved">已达成</option>
            <option value="abandoned">已放弃</option>
          </select>
        </label>
      ) : null}

      {submitError ? <p role="alert" className="text-caption1 text-error">{submitError}</p> : null}

      <div className="flex items-center justify-end gap-2 border-t border-border-subtle pt-4">
        <Button type="button" variant="ghost" onClick={onClose} disabled={submitting}>取消</Button>
        <Button type="submit" disabled={submitting}>{submitting ? "保存中…" : editingGoal ? "保存更改" : "创建目标"}</Button>
      </div>
    </form>
  );
}

function unitFor(type: GoalType, unit: string | null): string | null {
  if (type === "weight") return "kg";
  if (type === "consistency") return "天";
  return unit;
}
