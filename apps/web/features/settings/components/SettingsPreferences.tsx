"use client";

import { useState } from "react";
import { Card } from "@shared/ui/Card";
import { Input } from "@shared/ui/input";
import { Checkbox } from "@shared/ui/Checkbox";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@shared/ui/select";
import { Button } from "@shared/ui/button";
import { apiErrorMessage, apiFetch } from "@shared/lib/api";
import type { UserProfile } from "@shared/lib/auth";
import { getSportConfig } from "@shared/config/sport-config";

interface Props {
  profile: UserProfile;
  onSaved: () => void;
}

const SPORT_OPTIONS = [
  { value: "Run", label: getSportConfig("Run").label },
  { value: "TrailRun", label: getSportConfig("TrailRun").label },
];

const PREFS_KEY = "settings_prefs";

interface NotificationPrefs {
  allowConsecutiveHighIntensity: boolean;
  recoveryDayPreference: string;
}

function loadPrefs(): NotificationPrefs {
  try {
    const raw = localStorage.getItem(PREFS_KEY);
    if (raw) return JSON.parse(raw);
  } catch (error) {
    throw new Error("读取训练偏好失败", { cause: error });
  }
  return { allowConsecutiveHighIntensity: true, recoveryDayPreference: "active" };
}

function savePrefs(prefs: NotificationPrefs) {
  localStorage.setItem(PREFS_KEY, JSON.stringify(prefs));
}

export function SettingsPreferences({ profile, onSaved }: Props) {
  const [days, setDays] = useState(profile.weekly_training_days ?? 4);
  const [maxDuration, setMaxDuration] = useState(profile.max_session_duration_min ?? 90);
  const [sport, setSport] = useState(profile.preferred_sport ?? "Run");
  const [prefs, setPrefs] = useState<NotificationPrefs>(loadPrefs);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const hasChanges =
    days !== (profile.weekly_training_days ?? 4) ||
    maxDuration !== (profile.max_session_duration_min ?? 90) ||
    sport !== (profile.preferred_sport ?? "Run");

  const handleSave = async () => {
    setSaving(true);
    setError(null);
    setSaved(false);
    try {
      await apiFetch("/athletes/me", {
        method: "PUT",
        body: JSON.stringify({
          weekly_training_days: Number(days),
          max_session_duration_min: Number(maxDuration),
          preferred_sport: sport,
        }),
      });
      savePrefs(prefs);
      setSaved(true);
      onSaved();
      setTimeout(() => setSaved(false), 3000);
    } catch (err: unknown) {
      setError(apiErrorMessage(err, "保存偏好设置失败"));
    } finally {
      setSaving(false);
    }
  };

  return (
    <Card padding="md" className="space-y-6">
      <div>
        <h2 className="text-caption1 font-semibold text-text-secondary">训练习惯与偏好</h2>
        <p className="mt-0.5 text-caption1 text-text-muted">设置跑步训练计划的基础偏好</p>
      </div>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
        <label className="flex flex-col gap-1.5">
          <span className="text-subheadline font-medium text-text-secondary">主要偏好运动</span>
          <Select
            value={sport}
            onValueChange={(v) => {
              setSport(v);
              setSaved(false);
            }}
          >
            <SelectTrigger className="min-h-[44px] w-full bg-surface-overlay">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {SPORT_OPTIONS.map((option) => (
                <SelectItem key={option.value} value={option.value}>
                  {option.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <span className="text-caption1 text-text-muted">默认在图表与日历中优先展示该运动类型</span>
        </label>

        <label className="flex flex-col gap-1.5">
          <span className="text-subheadline font-medium text-text-secondary">恢复日安排偏好</span>
          <Select
            value={prefs.recoveryDayPreference}
            onValueChange={(value) => {
              setPrefs({ ...prefs, recoveryDayPreference: value });
              savePrefs({ ...prefs, recoveryDayPreference: value });
            }}
          >
            <SelectTrigger className="min-h-[44px] w-full bg-surface-overlay">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="active">积极恢复 (低强度交叉/散步/拉伸)</SelectItem>
              <SelectItem value="full">完全休息 (不安排任何训练课目)</SelectItem>
              <SelectItem value="flexible">灵活安排（结合训练计划）</SelectItem>
            </SelectContent>
          </Select>
          <span className="text-caption1 text-text-muted">决定训练建议中休息日的课目性质</span>
        </label>

        <label className="flex flex-col gap-1.5">
          <div className="flex items-center justify-between">
            <span className="text-subheadline font-medium text-text-secondary">每周预期训练天数</span>
            <span className="text-subheadline font-semibold text-accent-strong">{days} 天/周</span>
          </div>
          <div className="flex items-center gap-3">
            <Input
              type="number"
              min={1}
              max={7}
              value={days}
              onChange={(e) => {
                setDays(Math.max(1, Math.min(7, Number(e.target.value) || 1)));
                setSaved(false);
              }}
              className="w-24"
            />
            <span className="text-caption1 text-text-muted">建议范围：2～6 天</span>
          </div>
        </label>

        <label className="flex flex-col gap-1.5">
          <div className="flex items-center justify-between">
            <span className="text-subheadline font-medium text-text-secondary">单次训练最长时间</span>
            <span className="text-subheadline font-semibold text-accent-strong">{maxDuration} 分钟</span>
          </div>
          <div className="flex items-center gap-3">
            <Input
              type="number"
              min={15}
              max={360}
              step={15}
              value={maxDuration}
              onChange={(e) => {
                setMaxDuration(Math.max(15, Number(e.target.value) || 15));
                setSaved(false);
              }}
              className="w-24"
            />
            <span className="text-caption1 text-text-muted">超过此时长时提示训练时间较长</span>
          </div>
        </label>

        <div className="md:col-span-2 pt-2 border-t border-border-subtle">
          <label className="flex items-center justify-between p-3 rounded-lg border border-border-subtle bg-surface-subtle/50 hover:bg-surface-subtle cursor-pointer transition-colors">
            <div className="flex flex-col">
              <span className="text-subheadline font-medium text-text-primary">允许连续安排高强度训练</span>
              <span className="text-caption1 text-text-muted">开启后可连续两天安排无氧或阈值训练</span>
            </div>
            <Checkbox
              checked={prefs.allowConsecutiveHighIntensity}
              onChange={(checked) => {
                setPrefs((prev) => {
                  const next = { ...prev, allowConsecutiveHighIntensity: checked };
                  savePrefs(next);
                  return next;
                });
              }}
            />
          </label>
        </div>
      </div>

      {error && (
        <div className="p-3 bg-error/10 border border-error/30 text-error rounded-lg text-subheadline">
          {error}
        </div>
      )}

      <div className="flex items-center justify-between pt-2 border-t border-border-subtle">
        <div className="text-caption1 text-text-muted">
          {saved && <span className="text-success font-medium">✓ 偏好设置已保存</span>}
          {!saved && hasChanges && <span className="text-warning">● 有未保存的偏好修改</span>}
        </div>
        <Button onClick={handleSave} disabled={saving || !hasChanges}>
          {saving ? "保存中…" : "保存偏好"}
        </Button>
      </div>
    </Card>
  );
}
