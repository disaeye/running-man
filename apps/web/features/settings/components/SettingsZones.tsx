"use client";

import { useMemo, useState, useEffect } from "react";
import { Card } from "@shared/ui/Card";
import { Skeleton } from "@shared/ui/Skeleton";
import { Button } from "@shared/ui/button";
import { Badge } from "@shared/ui/Badge";
import { Segmented } from "@shared/ui/SegmentedControl";
import { useToast } from "@shared/ui/Toast";
import { formatPaceFromSeconds } from "@shared/lib/format";
import type { HrScheme, ZoneOverride } from "@features/settings/hooks/useZoneOverrides";
import { HEART_RATE_UNIT } from "@shared/config/terms";
import { ZoneEditor, validateZones, pct, type DraftRow } from "./SettingsZoneEditor";
import { HrSchemePicker } from "./HrSchemePicker";
import type { ZoneSchemeOption } from "./HrSchemePicker";
import { PaceZoneList } from "./PaceZoneList";

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
  const [zoneTab, setZoneTab] = useState<"hr" | "pace">("hr");
  const [msg, setMsg] = useState<{ type: "ok" | "err"; text: string } | null>(null);
  const { toast } = useToast();

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
    setMsg({ type: ok ? "ok" : "err", text: ok ? "自定义心率边界已保存" : "保存失败，请重试" });
    if (ok) {
      setEditing(false);
      toast("自定义心率边界已保存", "success");
    }
  };

  const handleReset = async () => {
    const ok = await onReset();
    setMsg({ type: ok ? "ok" : "err", text: ok ? "已恢复默认分区" : "恢复失败，请重试" });
    if (ok) {
      setEditing(false);
      toast("已恢复默认分区", "success");
    }
  };

  const handleCancelEdit = () => {
    setHrDraft(zonesToDrafts(hrZones));
    setEditing(false);
    setMsg(null);
  };

  const referenceText = [
    hrMax != null ? `最大心率 ${hrMax}${hrMaxEstimated ? "（年龄估算）" : ""}` : null,
    lthr != null ? `阈值心率 ${lthr}` : null,
    restingHr != null ? `静息心率 ${restingHr}` : null,
  ].filter(Boolean).join(" · ");

  return (
    <Card padding="md" className="content-arrival">
      <div className="mb-3 flex flex-wrap items-start justify-between gap-2">
        <div>
          <div className="flex items-center gap-2">
            <h2 className="text-caption1 font-semibold text-text-secondary">心率与配速区间</h2>
            {zoneTab === "hr" && hasOverrides && <Badge variant="info">已自定义边界</Badge>}
            {zoneTab === "pace" && thresholdPace != null && (
              <span className="rounded-full bg-surface-overlay px-2 py-0.5 font-mono text-caption1 tabular-nums text-text-primary">
                阈值基准 {formatPaceFromSeconds(thresholdPace)} /km
              </span>
            )}
          </div>
          {zoneTab === "hr" && referenceText ? (
            <p className="mt-1 text-caption1 text-text-muted">基准：{referenceText}</p>
          ) : null}
        </div>
        {zoneTab === "hr" && hrZones.length > 0 && (!editing ? (
          <Button variant="secondary" onClick={() => { setEditing(true); setMsg(null); }}>编辑边界</Button>
        ) : (
          <Button variant="ghost" onClick={handleCancelEdit}>取消</Button>
        ))}
      </div>

      <div className="mb-4">
        <Segmented
          options={[
            { value: "hr" as const, label: "心率区间" },
            { value: "pace" as const, label: "配速区间" },
          ]}
          value={zoneTab}
          onChange={setZoneTab}
        />
      </div>

      {zoneTab === "hr" ? (
        <>
          <HrSchemePicker
            current={hrScheme}
            options={hrSchemeOptions}
            saving={saving}
            citation={hrSchemeCitation}
            onSelect={async (scheme) => {
              if (editing && hrDirty) {
                setMsg({ type: "err", text: "请先保存或取消当前心率边界编辑，再切换分区方案。" });
                return false;
              }
              const ok = await onSelectScheme(scheme);
              setMsg(
                ok
                  ? { type: "ok", text: "方案已切换" }
                  : { type: "err", text: "该方案缺少必要的阈值" },
              );
              if (ok) {
                setEditing(false);
                toast("心率分区方案已切换", "success");
              }
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
              <ZoneEditor
                zones={hrZones}
                unit={HEART_RATE_UNIT}
                drafts={hrDraft}
                errors={hrErrors}
                editable={editing}
                hrScheme={hrScheme}
                hrMax={hrMax}
                lthr={lthr}
                restingHr={restingHr}
                onChange={setHrDraft}
              />
            )}
          </div>

          {editing && (
            <div className="mt-4 flex flex-wrap items-center gap-3 border-t border-border-subtle pt-4">
              <Button onClick={handleSave} disabled={!canSave || saving}>
                {saving ? "保存中..." : "保存"}
              </Button>
              <Button variant="secondary" onClick={handleReset} disabled={saving || !hasOverrides}>
                恢复默认
              </Button>
            </div>
          )}
          {msg?.text && (
            <p
              role={msg.type === "err" ? "alert" : "status"}
              className={`mt-3 text-subheadline ${msg.type === "ok" ? "text-success" : "text-error"}`}
            >
              {msg.text}
            </p>
          )}
        </>
      ) : paceZones && paceZones.length > 0 ? (
        <PaceZoneList paceZones={paceZones} thresholdPace={thresholdPace} bare />
      ) : (
        <p className="text-subheadline text-text-muted" data-testid="settings-pace-zones-empty">
          配速区间需先有阈值配速（生理自动估算或手动填写）。
        </p>
      )}
    </Card>
  );
}
