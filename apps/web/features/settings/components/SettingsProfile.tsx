"use client";

import { useState } from "react";
import { useSWRConfig } from "swr";
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
import { useToast } from "@shared/ui/Toast";
import { apiErrorMessage, apiFetch } from "@shared/lib/api";
import { timezoneOptions } from "@shared/config/timezones";
import type { UserProfile } from "@shared/lib/auth";
import { invalidateDataCards } from "@features/data/lib/invalidate-after-sync";

interface Props {
  profile: UserProfile;
  onSaved: () => void;
}

export function SettingsProfile({ profile, onSaved }: Props) {
  const { mutate } = useSWRConfig();
  const { toast } = useToast();
  const baseTimezone = profile.timezone || "UTC";
  const [source, setSource] = useState(profile);
  const [name, setName] = useState(profile.name || "");
  const [timezone, setTimezone] = useState(baseTimezone);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (source !== profile) {
    setSource(profile);
    setName(profile.name || "");
    setTimezone(baseTimezone);
    setError(null);
  }

  const hasChanges = name !== (profile.name || "") || timezone !== baseTimezone;

  const handleSave = async () => {
    const timezoneChanged = timezone !== baseTimezone;
    setSaving(true);
    setError(null);
    setSaved(false);
    try {
      await apiFetch("/athletes/me", {
        method: "PUT",
        body: JSON.stringify({ name: name.trim(), timezone }),
      });
      setSaved(true);
      toast("个人信息已保存", "success");
      onSaved();
      if (timezoneChanged) {
        void invalidateDataCards(mutate);
      }
    } catch (err: unknown) {
      setError(apiErrorMessage(err, "保存失败，请稍后重试"));
    } finally {
      setSaving(false);
    }
  };

  return (
    <Card padding="md" className="space-y-6">
      <div>
        <h2 className="text-caption1 font-semibold text-text-secondary">基本信息</h2>
        <p className="mt-0.5 text-caption1 text-text-muted">管理您的运动员称呼与系统时区</p>
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
      </div>

      {error && (
        <div className="p-3 bg-error/10 border border-error/30 text-error rounded-lg text-subheadline">
          {error}
        </div>
      )}

      <div className="flex items-center justify-between pt-2 border-t border-border-subtle">
        <div className="text-caption1 text-text-muted">
          {saved && !hasChanges && <span className="text-success font-medium">✓ 个人信息已更新</span>}
          {hasChanges && !saving && <span className="text-warn font-medium">有未保存的改动，点击「保存修改」后生效</span>}
        </div>
        <Button onClick={handleSave} disabled={saving || !hasChanges} className={hasChanges && !saving ? "ring-2 ring-accent/40" : undefined}>
          {saving ? "保存中…" : "保存修改"}
        </Button>
      </div>
    </Card>
  );
}
