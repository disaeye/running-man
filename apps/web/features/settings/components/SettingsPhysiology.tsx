"use client";
import { useState } from "react";
import { Card } from "@shared/ui/Card";
import { Button } from "@shared/ui/button";
import { Badge } from "@shared/ui/Badge";
import { usePhysiology } from "@features/settings/hooks/usePhysiology";
import { apiFetch } from "@shared/lib/api";
import type { UserProfile } from "@shared/lib/auth";

interface Props { profile: UserProfile; onSaved: () => void; }

export function SettingsPhysiology({ profile, onSaved }: Props) {
  const { data, loading, error, calculate } = usePhysiology();
  const [saving, setSaving] = useState(false);

  const handleApply = async () => {
    if (!data) return;
    setSaving(true);
    try {
      await apiFetch("/athletes/me", {
        method: "PUT",
        body: JSON.stringify({
          id: profile.id,
          email: profile.email,
          hr_max: data.hr_max,
          lthr: data.lthr,
          threshold_pace: data.threshold_pace,
        }),
      });
      onSaved();
    } finally {
      setSaving(false);
    }
  };

  return (
    <Card padding="sm">
      <h2 className="mb-1 text-headline font-semibold text-text-primary">生理估算</h2>
      <p className="mb-4 text-caption1 text-text-muted">自动估算 HRmax / LTHR / 阈值配速</p>

      <div className="mb-4 grid grid-cols-3 gap-4">
        <div>
          <p className="text-caption1 text-text-muted">当前 HRmax</p>
          <p className="text-headline font-bold text-text-primary">{profile.hr_max ?? "—"}</p>
        </div>
        <div>
          <p className="text-caption1 text-text-muted">当前 LTHR</p>
          <p className="text-headline font-bold text-text-primary">{profile.lthr ?? "—"}</p>
        </div>
        <div>
          <p className="text-caption1 text-text-muted">当前阈值配速</p>
          <p className="text-headline font-bold text-text-primary">{profile.threshold_pace ?? "—"}</p>
        </div>
      </div>

      <Button onClick={calculate} disabled={loading}>
        {loading ? "估算中…" : "自动估算"}
      </Button>

      {error && <p className="mt-2 text-subheadline text-error">{error}</p>}

      {data && (
        <div className="mt-4 border-t border-border-subtle pt-4">
          <div className="mb-2 flex items-center gap-2">
            <span className="text-subheadline font-medium text-text-primary">估算结果</span>
            {data.data_sufficient ? (
              <Badge variant="success">数据充足</Badge>
            ) : (
              <Badge variant="warning">数据不足</Badge>
            )}
          </div>
          <div className="mb-3 grid grid-cols-3 gap-4">
            <div>
              <p className="text-caption1 text-text-muted">估算 HRmax</p>
              <p className="text-headline font-bold text-accent-strong">{data.hr_max ?? "—"}</p>
            </div>
            <div>
              <p className="text-caption1 text-text-muted">估算 LTHR</p>
              <p className="text-headline font-bold text-accent-strong">{data.lthr ?? "—"}</p>
            </div>
            <div>
              <p className="text-caption1 text-text-muted">估算阈值配速</p>
              <p className="text-headline font-bold text-accent-strong">{data.threshold_pace ?? "—"}</p>
            </div>
          </div>
          {data.confidence && (
            <p className="mb-3 text-caption1 text-text-muted">置信度: {data.confidence}</p>
          )}
          {data.data_sufficient && (
            <Button onClick={handleApply} disabled={saving}>
              {saving ? "保存中…" : "采用估算值"}
            </Button>
          )}
        </div>
      )}
    </Card>
  );
}
