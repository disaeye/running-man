"use client";

import { useState } from "react";
import { useSWRConfig } from "swr";
import { ChevronDown } from "lucide-react";
import type { TermKey } from "@shared/config/terms";
import { PageCard } from "@shared/ui/Card";
import { Tag } from "@shared/ui/Badge";
import { MetricInlineDisclosure } from "@shared/ui/MetricInlineDisclosure";
import { useToast } from "@shared/ui/Toast";
import { invalidateDataCards } from "@features/data/lib/invalidate-after-sync";
import { apiErrorMessage, apiFetch } from "@shared/lib/api";
import { NO_VALUE } from "@shared/lib/use-data-state";

interface ActivityLoadLevelsProps {
  activityId: string;
  isStrength?: boolean;
  intensityFactor: number | null;
  trainingStress: number | null;
  rpe: number | null;
  trimp: number | null;
}

/**
 * 强度与负荷。
 *
 * IF 与 rTSS 单独一个数字看不出程度，这里给出刻度和所处档位的文字说明；
 * RPE 由运动员自己录入，跑完当场就能标。
 */
export function ActivityLoadLevels({
  activityId,
  isStrength = false,
  intensityFactor,
  trainingStress,
  rpe,
  trimp,
}: ActivityLoadLevelsProps) {
  const { mutate } = useSWRConfig();
  const { toast } = useToast();
  const [saving, setSaving] = useState(false);
  const [optimisticRpe, setOptimisticRpe] = useState<number | null | undefined>(undefined);
  const [error, setError] = useState<string | null>(null);
  const [rpeOpen, setRpeOpen] = useState(false);
  const shownRpe = optimisticRpe !== undefined ? optimisticRpe : rpe;

  async function saveRpe(next: number | null) {
    setOptimisticRpe(next);
    setSaving(true);
    setError(null);
    try {
      await apiFetch(`/activities/${activityId}/rpe`, {
        method: "PATCH",
        body: JSON.stringify({ rpe: next }),
      });
      await Promise.all([
        invalidateDataCards(mutate),
        mutate(
          (key) => Array.isArray(key) && typeof key[0] === "string" && key[0].startsWith(`/activities/${activityId}`),
          undefined,
          { revalidate: true },
        ),
      ]);
      setOptimisticRpe(undefined);
      toast(next == null ? "已清除 RPE" : "RPE 已保存", "success");
    } catch (caught) {
      setOptimisticRpe(undefined);
      setError(apiErrorMessage(caught, "保存失败"));
    } finally {
      setSaving(false);
    }
  }

  return (
    <PageCard title="强度与负荷" action={<Tag>按来源与自评</Tag>}>
      <div className="space-y-4">
        <Level
          label="IF 强度系数"
          termKey="IF"
          value={intensityFactor}
          format={(value) => value.toFixed(2)}
          min={0.6}
          max={1.2}
          grades={[
            { upTo: 0.75, label: "轻松有氧" },
            { upTo: 0.85, label: "耐力" },
            { upTo: 0.95, label: "节奏" },
            { upTo: 1.05, label: "阈值" },
            { upTo: Infinity, label: "高强度" },
          ]}
        />
        <Level
          label={isStrength ? "训练负荷 TSS" : "rTSS 跑步训练负荷"}
          termKey="TSS"
          value={trainingStress}
          format={(value) => value.toFixed(1)}
          min={0}
          max={250}
          grades={[
            { upTo: 50, label: "轻松" },
            { upTo: 100, label: "中等" },
            { upTo: 150, label: "偏高" },
            { upTo: Infinity, label: "很高" },
          ]}
        />

        <div className="space-y-2 border-t border-border-subtle pt-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <button
              type="button"
              aria-expanded={rpeOpen}
              onClick={() => setRpeOpen((prev) => !prev)}
              className="focus-ring tactile flex min-h-10 items-center gap-2 rounded-lg text-left text-xs font-medium text-text-secondary hover:text-text-primary"
            >
              <span>RPE 主观用力</span>
              <span className="num rounded-full bg-secondary px-2 py-0.5 text-caption1 font-semibold tabular-nums text-text-primary">
                {shownRpe != null ? `${shownRpe} / 10` : "未记录"}
              </span>
              <span className="text-caption1 text-accent-strong">{rpeOpen ? "收起" : shownRpe != null ? "修改" : "记录"}</span>
              <ChevronDown className={`size-3.5 text-text-muted transition-transform ${rpeOpen ? "rotate-180" : ""}`} aria-hidden />
            </button>
            <span className="num text-caption1 tabular-nums text-muted-foreground">
              TRIMP {trimp != null ? trimp.toFixed(1) : NO_VALUE}
            </span>
          </div>
          {rpeOpen ? (
            <div className="space-y-2 pt-1">
              <div className="grid grid-cols-5 gap-1.5 sm:grid-cols-10" role="group" aria-label="RPE 主观用力">
                {[1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map((score) => (
                  <button
                    key={score}
                    type="button"
                    disabled={saving}
                    aria-label={`RPE ${score}`}
                    aria-pressed={shownRpe === score}
                    onClick={() => void saveRpe(shownRpe === score ? null : score)}
                    className={`num h-11 rounded-lg text-sm transition-colors ${
                      shownRpe === score ? "bg-primary font-semibold text-primary-foreground" : "bg-secondary text-muted-foreground hover:text-text-primary"
                    } disabled:opacity-50`}
                  >
                    {score}
                  </button>
                ))}
              </div>
              <p className="text-caption1 text-muted-foreground">
                1 是散步般的轻松，10 是拼尽全力；再点一次已选的数字可清除。
              </p>
            </div>
          ) : null}
          {error ? <p role="alert" className="text-caption1 text-destructive">{error}</p> : null}
        </div>
      </div>
    </PageCard>
  );
}

interface Grade {
  upTo: number;
  label: string;
}

/** 一条刻度：数值落在哪一档、刻度上标出位置 */
function Level({
  label,
  termKey,
  value,
  format,
  min,
  max,
  grades,
}: {
  label: string;
  termKey: TermKey;
  value: number | null;
  format: (value: number) => string;
  min: number;
  max: number;
  grades: readonly Grade[];
}) {
  const grade = value != null ? grades.find((entry) => value <= entry.upTo) : null;
  const ratio = value != null ? Math.min(1, Math.max(0, (value - min) / (max - min))) : null;

  return (
    <div className="space-y-1.5">
      <div className="flex items-start justify-between gap-2">
        <span className="inline-flex items-center gap-1 text-xs font-medium text-text-secondary">
          <span>{label}</span>
          <MetricInlineDisclosure termKey={termKey} />
        </span>
        <span className="num shrink-0 text-caption1 tabular-nums text-muted-foreground">
          {value != null ? `${format(value)} · ${grade?.label ?? ""}` : NO_VALUE}
        </span>
      </div>
      <div className="relative h-2 rounded-full bg-secondary">
        {ratio != null ? (
          <div
            className="absolute -top-1 h-4 w-1 rounded-full bg-primary"
            style={{ left: `calc(${ratio * 100}% - 2px)` }}
            aria-hidden
          />
        ) : null}
      </div>
      <div className="flex justify-between text-caption2 text-muted-foreground">
        <span className="num">{min}</span>
        <span className="num">{max}</span>
      </div>
    </div>
  );
}
