"use client";

import { useState } from "react";
import { DisclosureCard } from "@shared/ui/DisclosureCard";
import { Input } from "@shared/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@shared/ui/select";
import { Button } from "@shared/ui/button";
import { ThemeModeSelector } from "@shared/ui/ThemeToggle";
import { useTheme } from "@shared/lib/theme-provider";
import { useToast } from "@shared/ui/Toast";
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

export function SettingsPreferences({ profile, onSaved }: Props) {
  const { toast } = useToast();
  const { mode } = useTheme();
  const [source, setSource] = useState(profile);
  const [days, setDays] = useState(profile.weekly_training_days ?? 4);
  const [maxDuration, setMaxDuration] = useState(profile.max_session_duration_min ?? 90);
  const [sport, setSport] = useState(profile.preferred_sport ?? "Run");
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (source !== profile) {
    setSource(profile);
    setDays(profile.weekly_training_days ?? 4);
    setMaxDuration(profile.max_session_duration_min ?? 90);
    setSport(profile.preferred_sport ?? "Run");
    setError(null);
  }

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
          weekly_training_days: Math.round(Number(days)),
          max_session_duration_min: Math.round(Number(maxDuration)),
          preferred_sport: sport,
        }),
      });
      setSaved(true);
      toast("训练偏好已保存", "success");
      onSaved();
    } catch (err: unknown) {
      setError(apiErrorMessage(err, "保存偏好设置失败"));
    } finally {
      setSaving(false);
    }
  };

  const sportLabel = SPORT_OPTIONS.find((option) => option.value === sport)?.label ?? sport;
  const themeLabel = mode === "light" ? "日光图谱" : mode === "system" ? "跟随系统" : "夜间遥测";

  return (
    <DisclosureCard
      title="训练习惯与偏好"
      summary={`${themeLabel} · ${sportLabel} · 每周 ${days} 天 · 单次上限 ${maxDuration} 分钟`}
    >
      <div className="space-y-6">
        <div className="space-y-2 border-b border-border-subtle pb-5">
          <div className="flex items-center justify-between gap-2">
            <span className="text-subheadline font-medium text-text-secondary">界面外观</span>
            <span className="text-caption1 text-text-muted">快捷键 Alt+T 快速切换</span>
          </div>
          <ThemeModeSelector />
        </div>
        <p className="text-caption1 text-text-muted">设置跑步训练计划的基础偏好，保存后同步用于计划生成</p>
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

        <div className="flex flex-col gap-1.5">
          <span className="text-subheadline font-medium text-text-secondary">度量单位</span>
          <p className="flex min-h-[44px] items-center rounded-lg border border-border-subtle bg-surface-subtle/50 px-3 text-subheadline text-text-secondary">
            公制（公里 km · 公斤 kg · 配速 min/km）
          </p>
          <span className="text-caption1 text-text-muted">当前统一使用公制单位展示</span>
        </div>

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
      </div>

      {error && (
        <div className="p-3 bg-error/10 border border-error/30 text-error rounded-lg text-subheadline">
          {error}
        </div>
      )}

      <div className="flex items-center justify-between pt-2 border-t border-border-subtle">
        <div className="text-caption1 text-text-muted">
          {saved && !hasChanges && <span className="text-success font-medium">✓ 偏好设置已保存</span>}
          {hasChanges && !saving && <span className="text-warn font-medium">有未保存的改动，点击「保存偏好」后生效</span>}
        </div>
        <Button onClick={handleSave} disabled={saving || !hasChanges} className={hasChanges && !saving ? "ring-2 ring-accent/40" : undefined}>
          {saving ? "保存中…" : "保存偏好"}
        </Button>
      </div>
      </div>
    </DisclosureCard>
  );
}
