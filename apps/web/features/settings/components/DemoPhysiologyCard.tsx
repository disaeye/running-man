"use client";

import { Card } from "@shared/ui/Card";
import { NO_VALUE } from "@shared/lib/use-data-state";
import { formatPaceFromSeconds } from "@shared/lib/format";

/**
 * 展示有来源的生理指标，并将缺失值标为未记录。
 */

interface Props {
  readonly vo2max: number | null;
  readonly vo2maxSource: string | null;
  readonly restingHr: number | null;
  readonly lthr: number | null;
  readonly thresholdPaceSPerKm: number | null;
  readonly weightKg: number | null;
  readonly heightCm: number | null;
  readonly bodyFatPct: number | null;
  readonly windowDays: number;
  readonly testId?: string;
}

export function DemoPhysiologyCard({
  vo2max,
  vo2maxSource,
  restingHr,
  lthr,
  thresholdPaceSPerKm,
  weightKg,
  heightCm,
  bodyFatPct,
  windowDays,
  testId,
}: Props) {
  const bmi = bodyMassIndex(weightKg, heightCm);
  return (
    <Card data-testid={testId ?? "demo-physiology-card"}>
      <div className="flex items-baseline justify-between gap-3">
        <h2 className="text-title3 font-semibold text-text-primary">身体与跑步能力</h2>
        <span className="text-caption1 text-text-muted">个人区间：近 {windowDays} 天</span>
      </div>

      <div className="mt-4 grid grid-cols-2 gap-3">
        <Reading
          label="最大摄氧量 (VO2max)"
          value={vo2max != null ? vo2max.toFixed(1) : null}
          unit="ml/kg/min"
          note={vo2maxSource ? `来源：${vo2maxSource}` : "未记录来源数据"}
        />
        <Reading
          label="静息心率 (RHR)"
          value={restingHr != null ? String(Math.round(restingHr)) : null}
          unit="BPM"
          note={restingHr != null ? "设备上报的晨间静息心率" : "设备未上报"}
        />
        <Reading
          label="乳酸阈心率 (LTHR)"
          value={lthr != null ? String(Math.round(lthr)) : null}
          unit="BPM"
          note={
            thresholdPaceSPerKm != null
              ? `阈值配速 ${formatPaceFromSeconds(Math.round(thresholdPaceSPerKm))}/km`
              : "阈值配速未确定"
          }
        />
        <Reading
          label="晨间体重"
          value={weightKg != null ? weightKg.toFixed(1) : null}
          unit="KG"
          note={
            bmi != null ? `体质指数 ${bmi.toFixed(1)}` : "缺少身高，算不出体质指数"
          }
        />
        <Reading
          label="体脂率 (BF%)"
          value={bodyFatPct != null ? bodyFatPct.toFixed(1) : null}
          unit="%"
          note={bodyFatPct != null ? "设备上报的体脂率" : "设备未上报"}
        />
      </div>
    </Card>
  );
}

/**
 * 一格读数。
 */
function Reading({
  label,
  value,
  unit,
  note,
}: {
  readonly label: string;
  readonly value: string | null;
  readonly unit: string;
  readonly note: string;
}) {
  return (
    <div className="rounded-lg bg-surface-overlay px-3 py-2.5">
      <p className="text-caption1 text-text-muted">{label}</p>
      {value == null ? (
        <p className="mt-1 text-caption1 text-text-muted">{NO_VALUE}</p>
      ) : (
        <p className="mt-1 flex items-baseline gap-1">
          <span className="font-mono text-title2 font-bold tabular-nums text-text-primary">
            {value}
          </span>
          <span className="text-caption1 text-text-muted">{unit}</span>
        </p>
      )}
      <p className="mt-1 text-caption1 text-text-muted">{note}</p>
    </div>
  );
}

/**
 * 体质指数。
 *
 * 身高来自 Intervals.icu 的运动员档案。没有身高就算不出 BMI，所以那时
 * 这一格写「缺少身高」，不写一个用默认身高算出来的数。
 */
function bodyMassIndex(weightKg: number | null, heightCm: number | null): number | null {
  if (weightKg == null || heightCm == null || heightCm <= 0) return null;
  const metres = heightCm / 100;
  return weightKg / (metres * metres);
}
