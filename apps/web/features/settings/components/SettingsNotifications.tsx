"use client";

import { useState, useCallback } from "react";
import { DisclosureCard } from "@shared/ui/DisclosureCard";
import { Button } from "@shared/ui/button";
import { Checkbox } from "@shared/ui/Checkbox";
import { apiErrorMessage, apiFetch } from "@shared/lib/api";
import type { UserProfile, NotificationPrefs } from "@shared/lib/auth";

const DEFAULT_PREFS: NotificationPrefs = {
  today_reminder: true,
  recovery_risk_alert: true,
  sync_failure_alert: true,
  plan_deviation_alert: false,
};

interface ToggleProps {
  checked: boolean;
  onChange: (v: boolean) => void;
  label: string;
  description: string;
}

function ToggleItem({
  checked,
  onChange,
  label,
  description,
}: ToggleProps) {
  return (
    <label className="flex items-center justify-between p-3.5 rounded-lg border border-border-subtle bg-surface-subtle/40 hover:bg-surface-subtle cursor-pointer transition-colors">
      <div className="space-y-0.5 pr-4">
        <p className="text-subheadline font-medium text-text-primary">{label}</p>
        <p className="text-caption1 text-text-muted">{description}</p>
      </div>
      <Checkbox checked={checked} onChange={onChange} />
    </label>
  );
}

interface SettingsNotificationsProps {
  profile: UserProfile;
  onSaved: () => void;
}

const TOGGLES: {
  key: keyof NotificationPrefs;
  label: string;
  description: string;
}[] = [
  {
    key: "today_reminder",
    label: "每日训练建议推送",
    description: "每天早上根据昨夜睡眠和近期健康记录生成当日课目建议",
  },
  {
    key: "recovery_risk_alert",
    label: "恢复指标提醒",
    description: "当 HRV 或静息心率出现明显变化时发送提醒",
  },
  {
    key: "sync_failure_alert",
    label: "第三方数据同步异常告警",
    description: "当 Intervals.icu 鉴权失效、接口超时或解析中断时提醒处理",
  },
  {
    key: "plan_deviation_alert",
    label: "训练计划执行偏差提醒",
    description: "当实际跑量或强度与设定的目标区间发生明显偏离时提供调优指引",
  },
];

export function SettingsNotifications({ profile, onSaved }: SettingsNotificationsProps) {
  const baseline = profile.notification_prefs ?? DEFAULT_PREFS;
  const [sourcePrefs, setSourcePrefs] = useState(profile.notification_prefs);
  const [prefs, setPrefs] = useState<NotificationPrefs>(() => baseline);
  if (sourcePrefs !== profile.notification_prefs) {
    setSourcePrefs(profile.notification_prefs);
    if (profile.notification_prefs) {
      setPrefs(profile.notification_prefs);
    }
  }
  const hasChanges = JSON.stringify(prefs) !== JSON.stringify(baseline);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  const update = useCallback(<K extends keyof NotificationPrefs>(key: K, value: NotificationPrefs[K]) => {
    setPrefs((prev) => ({ ...prev, [key]: value }));
    setSaved(false);
    setError(null);
  }, []);

  const handleSave = useCallback(async () => {
    setSaving(true);
    setError(null);
    setSaved(false);
    try {
      await apiFetch<unknown>("/athletes/me", {
        method: "PUT",
        body: JSON.stringify({
          notification_prefs: prefs,
        }),
      });
      setSaved(true);
      onSaved();
    } catch (err: unknown) {
      setError(apiErrorMessage(err, "保存通知配置失败"));
    } finally {
      setSaving(false);
    }
  }, [prefs, onSaved]);

  const enabledCount = TOGGLES.filter((t) => prefs[t.key]).length;

  return (
    <DisclosureCard
      title="通知与预警偏好"
      summary={`已开启 ${enabledCount}/${TOGGLES.length} 项提醒 · 点击展开逐项调整`}
    >
      <div className="space-y-5">
        <p className="text-caption1 text-text-muted">
          定制系统关键事件提醒，配置会实时同步并在所有终端生效
        </p>

      <div className="space-y-3">
        {TOGGLES.map((t) => (
          <ToggleItem
            key={t.key}
            label={t.label}
            description={t.description}
            checked={prefs[t.key]}
            onChange={(v) => update(t.key, v)}
          />
        ))}
      </div>

      {error && (
        <div className="p-3 bg-error/10 border border-error/30 text-error rounded-lg text-subheadline">
          {error}
        </div>
      )}

      <div className="flex items-center justify-between pt-2 border-t border-border-subtle">
        <div className="text-caption1 text-text-muted">
          {saved && !hasChanges && <span className="text-success font-medium">✓ 通知设置已更新</span>}
          {hasChanges && !saving && <span className="text-warn font-medium">有未保存的改动，点击「保存通知偏好」后生效</span>}
        </div>
        <Button onClick={handleSave} disabled={saving || !hasChanges} className={hasChanges && !saving ? "ring-2 ring-accent/40" : undefined}>
          {saving ? "保存中…" : "保存通知偏好"}
        </Button>
      </div>
      </div>
    </DisclosureCard>
  );
}
