"use client";

import { useMemo, useState, useEffect } from "react";
import { Card } from "@shared/ui/Card";
import { Skeleton } from "@shared/ui/Skeleton";
import { Button } from "@shared/ui/button";
import { Badge } from "@shared/ui/Badge";
import type { HrScheme, ZoneOverride } from "@features/settings/hooks/useZoneOverrides";
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
  lthr: "乳酸阈心率 (LTHR)",
  resting_hr: "静息心率",
};

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
            <h2 className="text-headline font-semibold text-text-primary">心率分区方案</h2>
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

      {hrZones.length > 0 && (
        <div className="mt-4 space-y-2">
          <div className="flex items-center justify-between text-xs text-muted-foreground">
            <span className="font-medium text-foreground">心率 5 区标尺</span>
          </div>
          <div className="grid grid-cols-5 gap-1.5 overflow-hidden rounded-xl border border-border/40 bg-muted/20 p-1.5">
            {hrZones.map((z, idx) => {
              const colors = [
                "bg-sky-500/15 text-sky-400 border-sky-500/30",
                "bg-emerald-500/15 text-emerald-400 border-emerald-500/30",
                "bg-lime-500/15 text-lime-400 border-lime-500/30",
                "bg-amber-500/15 text-amber-400 border-amber-500/30",
                "bg-rose-500/15 text-rose-400 border-rose-500/30",
              ];
              return (
                <div
                  key={z.zone}
                  className={`flex flex-col items-center justify-center rounded-lg border p-2 text-center transition-all ${colors[idx] || colors[0]}`}
                >
                  <span className="font-mono text-xs font-bold">Z{z.zone}</span>
                  <span className="max-w-full truncate text-caption2 font-medium opacity-80">{z.name}</span>
                  <span className="mt-1 font-mono text-caption1 font-bold tabular-nums">
                    {z.min_value} {z.max_value ? `- ${z.max_value}` : "+"}
                  </span>
                </div>
              );
            })}
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 gap-6">
        {hrZones.length > 0 && (
          <ZoneEditor title="心率区间自定义" zones={hrZones} unit="bpm"
            drafts={hrDraft} errors={hrErrors} editable={editing} onChange={setHrDraft} />
        )}
      </div>

      {paceZones && paceZones.length > 0 ? (
        <div className="mt-6" data-testid="settings-pace-zones">
          <h3 className="text-subheadline font-semibold text-text-primary">
            配速区间（由阈值配速自动生成）
          </h3>
          {thresholdPace != null && (
            <p className="mt-1 text-caption1 text-text-muted">
              阈值配速 {Math.floor(thresholdPace / 60)}&apos;
              {String(Math.round(thresholdPace % 60)).padStart(2, "0")}&quot; /km
            </p>
          )}
          <ul className="mt-2 grid grid-cols-1 gap-1 sm:grid-cols-5">
            {paceZones.map((z) => (
              <li
                key={z.zone}
                className="rounded-md border border-border-subtle bg-surface-overlay/50 px-2 py-1.5 text-caption1"
              >
                <span className="font-medium text-text-primary">Z{z.zone} {z.name}</span>
                <span className="mt-0.5 block font-mono tabular-nums text-text-secondary">
                  {z.min_value > 0
                    ? `${Math.floor(z.min_value / 60)}'${String(Math.round(z.min_value % 60)).padStart(2, "0")}"`
                    : "—"}
                  –
                  {z.max_value != null
                    ? `${Math.floor(z.max_value / 60)}'${String(Math.round(z.max_value % 60)).padStart(2, "0")}"`
                    : "—"}
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
