"use client";

import { useState } from "react";
import { Card } from "@shared/ui/Card";
import { Input } from "@shared/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@shared/ui/select";
import { Button } from "@shared/ui/button";
import { apiFetch } from "@shared/lib/api";
import { timezoneOptions } from "@shared/config/timezones";
import type { UserProfile } from "@shared/lib/auth";

interface Props {
  profile: UserProfile;
  onSaved: () => void;
}

export function SettingsProfile({ profile, onSaved }: Props) {
  const [name, setName] = useState(profile.name || "");
  const [timezone, setTimezone] = useState(profile.timezone || "Asia/Shanghai");
  const [units, setUnits] = useState<"metric" | "imperial">(
    () => (typeof window !== "undefined" && localStorage.getItem("settings_units") as "metric" | "imperial") || "metric",
  );
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const hasChanges =
    name !== (profile.name || "") ||
    timezone !== (profile.timezone || "Asia/Shanghai") ||
    (typeof window !== "undefined" && (localStorage.getItem("settings_units") || "metric") !== units);

  const handleSave = async () => {
    setSaving(true);
    setError(null);
    setSaved(false);
    try {
      await apiFetch("/athletes/me", {
        method: "PUT",
        body: JSON.stringify({ name: name.trim(), timezone }),
      });
      if (typeof window !== "undefined") {
        localStorage.setItem("settings_units", units);
      }
      setSaved(true);
      onSaved();
      setTimeout(() => setSaved(false), 3000);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "保存失败，请稍后重试");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Card padding="md" className="space-y-6">
      <div>
        <h2 className="text-headline font-semibold text-text-primary">基本信息</h2>
        <p className="mt-0.5 text-caption1 text-text-muted">管理您的运动员称呼、系统时区及度量单位偏好</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
        <label className="flex flex-col gap-1.5">
          <span className="text-subheadline font-medium text-text-secondary">显示名称 / 昵称</span>
          <Input
            value={name}
            onChange={(e) => {
              setName(e.target.value);
              setSaved(false);
            }}
            placeholder="例如: 破风者"
          />
        </label>

        <label className="flex flex-col gap-1.5">
          <span className="text-subheadline font-medium text-text-secondary">登录邮箱 (不可修改)</span>
          <Input value={profile.email} disabled className="opacity-60 cursor-not-allowed bg-surface-subtle" />
        </label>

        <label className="flex flex-col gap-1.5">
          <span className="text-subheadline font-medium text-text-secondary">所在时区</span>
          <Select
            value={timezone}
            onValueChange={(v) => {
              setTimezone(v);
              setSaved(false);
            }}
          >
            <SelectTrigger className="min-h-[44px] w-full bg-surface-overlay">
              <SelectValue placeholder="选择时区" />
            </SelectTrigger>
            <SelectContent>
              {timezoneOptions(timezone).map((zone) => (
                <SelectItem key={zone} value={zone}>
                  {zone}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <span className="text-caption1 text-text-muted">用于按天划分训练日志与生理指标统计周期</span>
        </label>

        <div className="flex flex-col gap-1.5">
          <span className="text-subheadline font-medium text-text-secondary">度量单位系统</span>
          <div className="grid grid-cols-2 gap-2 h-[44px]">
            <button
              type="button"
              onClick={() => {
                setUnits("metric");
                setSaved(false);
              }}
              className={`focus-ring flex items-center justify-center rounded-md px-3 py-2 text-subheadline transition-all ${
                units === "metric"
                  ? "bg-accent text-accent-foreground font-medium shadow-sm"
                  : "bg-surface-overlay border border-border-default text-text-secondary hover:text-text-primary"
              }`}
            >
              公制 (km / kg)
            </button>
            <button
              type="button"
              onClick={() => {
                setUnits("imperial");
                setSaved(false);
              }}
              className={`focus-ring flex items-center justify-center rounded-md px-3 py-2 text-subheadline transition-all ${
                units === "imperial"
                  ? "bg-accent text-accent-foreground font-medium shadow-sm"
                  : "bg-surface-overlay border border-border-default text-text-secondary hover:text-text-primary"
              }`}
            >
              英制 (mi / lbs)
            </button>
          </div>
          <span className="text-caption1 text-text-muted">配速展示与体力量度均会自动适配</span>
        </div>
      </div>

      {error && (
        <div className="p-3 bg-error/10 border border-error/30 text-error rounded-lg text-subheadline">
          {error}
        </div>
      )}

      <div className="flex items-center justify-between pt-2 border-t border-border-subtle">
        <div className="text-caption1 text-text-muted">
          {saved && <span className="text-success font-medium">✓ 个人信息已更新</span>}
          {!saved && hasChanges && <span className="text-warning">● 有未保存的修改</span>}
        </div>
        <Button onClick={handleSave} disabled={saving || !hasChanges}>
          {saving ? "保存中…" : "保存修改"}
        </Button>
      </div>
    </Card>
  );
}
