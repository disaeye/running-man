"use client";

import { useState } from "react";
import { useSWRConfig } from "swr";
import { PageCard, Tag } from "@shared/ui/Lovable";
import { apiFetch } from "@shared/lib/api";
import { NO_VALUE } from "@shared/lib/use-data-state";

interface ActivityLoadLevelsProps {
  activityId: string;
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
  intensityFactor,
  trainingStress,
  rpe,
  trimp,
}: ActivityLoadLevelsProps) {
  const { mutate } = useSWRConfig();
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function saveRpe(next: number | null) {
    setSaving(true);
    setError(null);
    try {
      await apiFetch(`/activities/${activityId}/rpe`, {
        method: "PATCH",
        body: JSON.stringify({ rpe: next }),
      });
      await mutate(
        (key) => Array.isArray(key) && typeof key[0] === "string" && key[0].startsWith(`/activities/${activityId}`),
        undefined,
        { revalidate: true },
      );
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "保存失败");
    } finally {
      setSaving(false);
    }
  }

  return (
    <PageCard title="强度与负荷" action={<Tag>按来源与自评</Tag>}>
      <div className="space-y-4">
        <Level
          label="IF 强度系数"
          hint="本次强度相对阈值配速的比例；1.00 等于阈值强度"
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
          label="rTSS 跑步训练负荷"
          hint="按阈值配速折算的训练负荷：1 小时阈值跑约等于 100"
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
          <div className="flex items-baseline justify-between">
            <span className="text-xs font-medium text-text-secondary">RPE 主观用力</span>
            <span className="num text-caption1 text-muted-foreground">
              {rpe != null ? `${rpe} / 10` : "未记录"}
            </span>
          </div>
          <div className="flex gap-1.5" role="group" aria-label="RPE 主观用力">
            {[1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map((score) => (
              <button
                key={score}
                type="button"
                disabled={saving}
                aria-label={`RPE ${score}`}
                aria-pressed={rpe === score}
                onClick={() => void saveRpe(rpe === score ? null : score)}
                className={`num h-11 flex-1 rounded-lg text-sm ${
                  rpe === score ? "bg-primary text-primary-foreground" : "bg-secondary text-muted-foreground"
                } disabled:opacity-50`}
              >
                {score}
              </button>
            ))}
          </div>
          <p className="text-caption1 text-muted-foreground">
            1 是散步般的轻松，10 是拼尽全力；再点一次已选的数字可清除。
          </p>
          {error ? <p role="alert" className="text-caption1 text-destructive">{error}</p> : null}
        </div>

        <div className="flex items-baseline justify-between border-t border-border-subtle pt-3">
          <span className="text-xs font-medium text-text-secondary">TRIMP 训练冲量</span>
          <span className="num text-caption1 text-muted-foreground">
            {trimp != null ? trimp.toFixed(1) : NO_VALUE}
          </span>
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
  hint,
  value,
  format,
  min,
  max,
  grades,
}: {
  label: string;
  hint: string;
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
      <div className="flex items-baseline justify-between gap-2">
        <span className="text-xs font-medium text-text-secondary">{label}</span>
        <span className="num text-caption1 text-muted-foreground">
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
      <p className="text-caption1 text-muted-foreground">{hint}</p>
    </div>
  );
}
