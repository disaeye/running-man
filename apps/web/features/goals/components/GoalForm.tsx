"use client";

import { useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@shared/ui/dialog";
import { Button } from "@shared/ui/button";
import { Input } from "@shared/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@shared/ui/select";
import type { Goal, GoalType, GoalStatus } from "@shared/types/goals";
import { GOAL_TYPES } from "@shared/types/goals";

interface GoalFormProps {
  open: boolean;
  onClose: () => void;
  onSubmit: (data: GoalFormData) => void;
  editingGoal?: Goal | null;
}

export interface GoalFormData {
  type: GoalType;
  title: string;
  target_value: number | null;
  current_value: number;
  unit: string | null;
  target_date: string | null;
  race_distance_m: number | null;
  race_target_time_s: number | null;
  status: GoalStatus;
}

const TYPE_OPTIONS = Object.entries(GOAL_TYPES).map(([value, cfg]) => ({
  value,
  label: `${cfg.icon} ${cfg.label}`,
}));

/** Unit choices offered per goal type; the type's defaultUnit is first. */
const UNIT_OPTIONS: Record<GoalType, readonly string[]> = {
  event: ["km", "min"],
  distance: ["km", "m"],
  time: ["min", "h"],
  weight: ["kg", "lb"],
  consistency: ["天", "次", "周"],
};

function defaults(): GoalFormData {
  return {
    type: "event",
    title: "",
    target_value: null,
    current_value: 0,
    unit: "",
    target_date: "",
    race_distance_m: null,
    race_target_time_s: null,
    status: "active",
  };
}

export function GoalForm({ open, onClose, onSubmit, editingGoal }: GoalFormProps) {
  const [form, setForm] = useState<GoalFormData>(
    editingGoal
      ? {
          type: editingGoal.type,
          title: editingGoal.title,
          target_value: editingGoal.target_value,
          current_value: editingGoal.current_value,
          unit: editingGoal.unit ?? "",
          target_date: editingGoal.target_date ?? "",
          race_distance_m: editingGoal.race_distance_m,
          race_target_time_s: editingGoal.race_target_time_s,
          status: editingGoal.status,
        }
      : defaults(),
  );

  const [errors, setErrors] = useState<Record<string, string>>({});

  const update = (field: keyof GoalFormData, value: string | number | null) => {
    setForm((prev) => ({ ...prev, [field]: value }));
    setErrors((prev) => {
      const next = { ...prev };
      delete next[field];
      return next;
    });
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const errs: Record<string, string> = {};
    if (!form.title.trim()) errs.title = "请输入目标标题";
    if (form.target_value != null && form.target_value < 0)
      errs.target_value = "目标值不能为负";

    if (Object.keys(errs).length > 0) {
      setErrors(errs);
      return;
    }

    onSubmit({
      ...form,
      title: form.title.trim(),
      target_value: form.target_value ?? null,
      unit: form.unit?.trim() || null,
      target_date: form.target_date?.trim() || null,
      race_distance_m: form.race_distance_m,
      race_target_time_s: form.race_target_time_s,
    });
  };

  // Auto-set unit from type
  const handleTypeChange = (value: string) => {
    const typeCfg = GOAL_TYPES[value as GoalType];
    update("type", value);
    if (typeCfg) {
      update("unit", typeCfg.defaultUnit);
    }
    if (value !== "event") {
      update("race_distance_m", null);
      update("race_target_time_s", null);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(nextOpen) => { if (!nextOpen) onClose(); }}>
      <DialogContent className="max-h-[calc(100dvh-2rem)] overflow-y-auto">
        <DialogHeader><DialogTitle>{editingGoal ? "编辑目标" : "创建目标"}</DialogTitle></DialogHeader>
        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
        {/* Type selector */}
        <label className="flex flex-col gap-1"><span className="text-subheadline font-medium text-text-secondary">目标类型</span><Select value={form.type} onValueChange={handleTypeChange}><SelectTrigger className="min-h-[44px] w-full bg-surface-overlay"><SelectValue /></SelectTrigger><SelectContent>{TYPE_OPTIONS.map((option) => <SelectItem key={option.value} value={option.value}>{option.label}</SelectItem>)}</SelectContent></Select></label>

        {/* Title */}
        <label className="flex flex-col gap-1"><span className="text-subheadline font-medium text-text-secondary">目标名称</span><Input name="title" placeholder="例如：10K 破 45 分" value={form.title} onChange={(e) => update("title", e.target.value)} aria-invalid={Boolean(errors.title)} />{errors.title && <span className="text-caption1 text-error">{errors.title}</span>}</label>

        {/* Target value + unit */}
        <div className="grid grid-cols-2 gap-3">
          <label className="flex flex-col gap-1"><span className="text-subheadline font-medium text-text-secondary">目标值</span><Input name="target_value" type="number" step="0.1" placeholder="0" value={form.target_value ?? ""} onChange={(e) => update("target_value", e.target.value ? Number(e.target.value) : null)} aria-invalid={Boolean(errors.target_value)} />{errors.target_value && <span className="text-caption1 text-error">{errors.target_value}</span>}</label>
          <label className="flex flex-col gap-1"><span className="text-subheadline font-medium text-text-secondary">单位</span><Select value={form.unit ?? ""} onValueChange={(v) => update("unit", v)}><SelectTrigger className="min-h-[44px] w-full bg-surface-overlay"><SelectValue placeholder="选择单位" /></SelectTrigger><SelectContent>{UNIT_OPTIONS[form.type].map((unit) => <SelectItem key={unit} value={unit}>{unit}</SelectItem>)}</SelectContent></Select></label>
        </div>

        {form.type === "event" && (
          <div className="grid grid-cols-2 gap-3">
            <label className="flex flex-col gap-1"><span className="text-subheadline font-medium text-text-secondary">比赛距离（公里）</span><Input name="race_distance_m" type="number" min="1.5" max="1000" step="0.1" placeholder="例如 42.195" value={form.race_distance_m == null ? "" : form.race_distance_m / 1000} onChange={(e) => update("race_distance_m", e.target.value ? Number(e.target.value) * 1000 : null)} /></label>
            <label className="flex flex-col gap-1"><span className="text-subheadline font-medium text-text-secondary">目标完赛用时（分钟）</span><Input name="race_target_time_s" type="number" min="3" max="2880" step="1" placeholder="例如 240" value={form.race_target_time_s == null ? "" : form.race_target_time_s / 60} onChange={(e) => update("race_target_time_s", e.target.value ? Number(e.target.value) * 60 : null)} /></label>
          </div>
        )}

        {/* Target date */}
        <label className="flex flex-col gap-1"><span className="text-subheadline font-medium text-text-secondary">目标日期</span><Input name="target_date" type="date" value={form.target_date ?? ""} onChange={(e) => update("target_date", e.target.value)} /></label>

        {/* Actions */}
        <div className="flex items-center justify-end gap-2 border-t border-border-subtle pt-4">
          <Button type="button" variant="ghost" onClick={onClose}>
            取消
          </Button>
          <Button type="submit">
            {editingGoal ? "保存更改" : "创建目标"}
          </Button>
        </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
