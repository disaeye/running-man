"use client";

import { useMemo, useState, useEffect } from "react";
import { Card } from "@shared/ui/Card";
import { Skeleton } from "@shared/ui/Skeleton";
import { Button } from "@shared/ui/button";
import { Badge } from "@shared/ui/Badge";
import type { HrScheme, ZoneOverride } from "@features/settings/hooks/useZoneOverrides";
import { HEART_RATE_UNIT } from "@shared/config/terms";
import { ZoneEditor, validateZones, pct, type DraftRow } from "./SettingsZoneEditor";
import { HrSchemePicker } from "./HrSchemePicker";
import type { ZoneSchemeOption } from "./HrSchemePicker";

interface Zone {
  zone: number;
  name: string;
  min_pct: number;
  max_pct: number | null;
  min_value: number;
  max_value: number | null;
}

export interface SettingsZonesProps {
  hrZones: Zone[];
  paceZones?: Zone[] | null;
  thresholdPace?: number | null;
  /** Zone count is fixed at five; only the boundaries depend on the scheme. */
  hrScheme: HrScheme;
  hrSchemeOptions: ZoneSchemeOption[];
  hrSchemeCitation: string | null;
  /** Fields the active scheme still needs; when non-empty there are no zones. */
  unavailableRequirements: string[];
  hrMax: number | null;
  hrMaxEstimated: boolean;
  lthr: number | null;
  restingHr: number | null;
  hasOverrides: boolean;
  loading: boolean;
  saving: boolean;
  onSave: (hr: ZoneOverride[]) => Promise<boolean>;
  onReset: () => Promise<boolean>;
  onSelectScheme: (scheme: HrScheme) => Promise<boolean>;
}

const REQUIREMENT_LABEL: Record<string, string> = {
  hr_max: "最大心率",
  lthr: "乳酸阈心率",
  resting_hr: "静息心率",
};

/**
 * Pace zone bounds, formatted here rather than inline in the list.
 *
 * A boundary of 0 means "open", which the previous inline expression printed
 * as an em dash between the two numbers — a range that read like a value.
 */
function formatPaceRange(minSeconds: number, maxSeconds: number | null): string {
  const format = (seconds: number) =>
    `${Math.floor(seconds / 60)}'${String(Math.round(seconds % 60)).padStart(2, "0")}"`;
  if (minSeconds <= 0 && maxSeconds == null) return "不限";
  if (minSeconds <= 0) return `快于 ${format(maxSeconds as number)}`;
  if (maxSeconds == null) return `慢于 ${format(minSeconds)}`;
  return `${format(minSeconds)} – ${format(maxSeconds)}`;
}

function zonesToDrafts(zones: Zone[]): DraftRow[] {
  return zones.map((z) => ({
    zone: z.zone,
    name: z.name,
    min_pct: pct(z.min_pct),
    max_pct: pct(z.max_pct),
  }));
}

function draftsToOverrides(drafts: DraftRow[]): ZoneOverride[] {
  return drafts.map((d) => ({
    zone: d.zone,
    min_pct: Number(d.min_pct) / 100,
    max_pct: d.max_pct === "" ? null : Number(d.max_pct) / 100,
  }));
}

export function SettingsZones({
  hrZones, paceZones = null, thresholdPace = null,
  hrScheme, hrSchemeOptions, hrSchemeCitation, unavailableRequirements,
  hrMax, hrMaxEstimated, lthr, restingHr, hasOverrides,
  loading, saving, onSave, onReset, onSelectScheme,
}: SettingsZonesProps) {
  const [hrDraft, setHrDraft] = useState<DraftRow[]>([]);
  const [editing, setEditing] = useState(false);
  const [msg, setMsg] = useState<{ type: "ok" | "err"; text: string } | null>(null);

  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { setHrDraft(zonesToDrafts(hrZones)); }, [hrZones]);

  const hrErrors = useMemo(() => validateZones(hrDraft), [hrDraft]);
  const hrDirty = useMemo(() => {
    const orig = zonesToDrafts(hrZones);
    return hrDraft.some((d, i) => d.min_pct !== orig[i]?.min_pct || d.max_pct !== orig[i]?.max_pct);
  }, [hrDraft, hrZones]);

  const canSave = hrDirty && hrErrors.size === 0 && editing;

  if (loading) {
    return <Skeleton className="h-48 w-full" />;
  }

  const handleSave = async () => {
    const ok = await onSave(draftsToOverrides(hrDraft));
    setMsg({ type: ok ? "ok" : "err", text: ok ? "保存成功" : "保存失败" });
    if (ok) setEditing(false);
  };

  const handleReset = async () => {
    const ok = await onReset();
    setMsg({ type: ok ? "ok" : "err", text: ok ? "已恢复默认" : "恢复失败" });
    if (ok) setEditing(false);
  };

  const referenceText = [
    hrMax != null ? `最大心率 ${hrMax}${hrMaxEstimated ? "（年龄估算）" : ""}` : null,
    lthr != null ? `阈值心率 ${lthr}` : null,
    restingHr != null ? `静息心率 ${restingHr}` : null,
  ].filter(Boolean).join(" · ");

  return (
    <Card padding="sm">
      <div className="mb-4 flex flex-wrap items-start justify-between gap-2">
        <div>
          <div className="flex items-center gap-2">
            <h2 className="text-caption1 font-semibold text-text-secondary">心率分区方案</h2>
            {hasOverrides && <Badge variant="info">已自定义边界</Badge>}
          </div>
          <p className="mt-1 text-caption1 text-text-muted">
            五个区间固定不变，只有边界算法可选。{referenceText && `当前基准：${referenceText}。`}
          </p>
        </div>
        {hrZones.length > 0 && (!editing ? (
          <Button variant="secondary" onClick={() => { setEditing(true); setMsg(null); }}>编辑边界</Button>
        ) : (
          <Button variant="ghost" onClick={() => { setEditing(false); setMsg(null); }}>取消</Button>
        ))}
      </div>

      <HrSchemePicker
        current={hrScheme}
        options={hrSchemeOptions}
        saving={saving}
        citation={hrSchemeCitation}
        onSelect={async (scheme) => {
          const ok = await onSelectScheme(scheme);
          setMsg(
            ok
              ? { type: "ok", text: "方案已切换" }
              : { type: "err", text: "该方案缺少必要的阈值" },
          );
          if (ok) setEditing(false);
          return ok;
        }}
      />

      {unavailableRequirements.length > 0 && (
        <p className="mt-3 rounded-lg border border-warning/30 bg-warning/10 px-3 py-2 text-caption1 text-warning">
          该方案还需要：
          {unavailableRequirements.map((f) => REQUIREMENT_LABEL[f] ?? f).join("、")}
          。补齐后即可显示区间。
        </p>
      )}

      <div className="mt-4">
        {hrZones.length > 0 && (
          <ZoneEditor zones={hrZones} unit={HEART_RATE_UNIT}
            drafts={hrDraft} errors={hrErrors} editable={editing} onChange={setHrDraft} />
        )}
      </div>

      {paceZones && paceZones.length > 0 ? (
        <div className="mt-6" data-testid="settings-pace-zones">
          <h3 className="text-caption1 font-semibold text-text-secondary">
            配速区间（由阈值配速自动生成）
          </h3>
          {thresholdPace != null && (
            <p className="mt-1 text-caption1 text-text-muted">
              阈值配速 {Math.floor(thresholdPace / 60)}&apos;
              {String(Math.round(thresholdPace % 60)).padStart(2, "0")}&quot; /km
            </p>
          )}
          <ul className="mt-3 grid grid-cols-2 gap-x-4 gap-y-3 border-t border-border-subtle pt-3 sm:grid-cols-5">
            {paceZones.map((z) => (
              <li key={z.zone} className="text-caption1">
                <span className="font-medium text-text-primary">Z{z.zone} {z.name}</span>
                <span className="mt-0.5 block font-mono tabular-nums text-text-secondary">
                  {formatPaceRange(z.min_value, z.max_value)}
                </span>
              </li>
            ))}
          </ul>
        </div>
      ) : (
        <p className="mt-4 text-subheadline text-text-muted" data-testid="settings-pace-zones-empty">
          配速区间需先有阈值配速（生理自动估算或手动填写）。
        </p>
      )}

      {editing && (
        <div className="mt-4 flex flex-wrap items-center gap-3 border-t border-border-subtle pt-4">
          <Button onClick={handleSave} disabled={!canSave || saving}>
            {saving ? "保存中..." : "保存"}
          </Button>
          <Button variant="secondary" onClick={handleReset} disabled={saving || !hasOverrides}>
            恢复默认
          </Button>
          {msg?.text && (
            <span className={`text-subheadline ${msg.type === "ok" ? "text-success" : "text-error"}`}>
              {msg.text}
            </span>
          )}
        </div>
      )}
    </Card>
  );
}
