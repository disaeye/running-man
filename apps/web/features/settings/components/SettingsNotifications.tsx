"use client";

import { useState, useEffect, useCallback } from "react";
import { Card } from "@shared/ui/Card";
import { Button } from "@shared/ui/button";
import { apiFetch } from "@shared/lib/api";
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
      <input
        type="checkbox"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
        className="size-5 rounded border-border-default text-accent focus:ring-accent accent-accent cursor-pointer"
      />
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
    description: "每天早上根据昨夜恢复与当前负荷状态生成当日课目建议",
  },
  {
    key: "recovery_risk_alert",
    label: "过度训练与疲劳预警",
    description: "当连续高负荷导致 HRV 骤降或静息心率异常升高时触发保护提醒",
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
  const [prefs, setPrefs] = useState<NotificationPrefs>(
    () => profile.notification_prefs ?? DEFAULT_PREFS,
  );
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (profile.notification_prefs) setPrefs(profile.notification_prefs);
  }, [profile.notification_prefs]);

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
          id: profile.id,
          email: profile.email,
          notification_prefs: prefs,
        }),
      });
      setSaved(true);
      onSaved();
      setTimeout(() => setSaved(false), 3000);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "保存通知配置失败");
    } finally {
      setSaving(false);
    }
  }, [prefs, profile.id, profile.email, onSaved]);

  return (
    <Card padding="md" className="space-y-6">
      <div>
        <h2 className="text-headline font-semibold text-text-primary">通知与预警偏好</h2>
        <p className="mt-0.5 text-caption1 text-text-muted">
          定制系统关键事件提醒，配置会实时同步并在所有终端生效
        </p>
      </div>

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
          {saved && <span className="text-success font-medium">✓ 通知设置已更新</span>}
        </div>
        <Button onClick={handleSave} disabled={saving}>
          {saving ? "保存中…" : "保存通知偏好"}
        </Button>
      </div>
    </Card>
  );
}
