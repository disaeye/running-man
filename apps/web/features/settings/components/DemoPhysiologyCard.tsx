"use client";

import { Card } from "@shared/ui/Card";
import { LabelCaps } from "@shared/ui/LabelCaps";
import { NO_VALUE } from "@shared/lib/use-data-state";
import { formatPaceFromSeconds } from "@shared/lib/format";
import type { RangeFigure } from "@features/today/hooks/usePersonalRange";

/**
 * 生理机能与跑力雷达（参考稿的生理机能卡）。
 *
 * 上半是最大摄氧量与五维雷达，下半是四格读数：静息心率、乳酸阈心率、
 * 体重与体质指数、体脂率。
 *
 * 雷达的每一根轴都是一个真实指标，轴上的位置是当前值在本人近 90 天
 * 区间里的位置——参照系写在卡片上，没有「同龄超越百分比」这种没有
 * 依据的说法。
 *
 * 缺项写「未记录」并说明原因：设备没测到的项不占一个假数字。
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
  /** 雷达的轴：指标与它在本人区间里的位置。 */
  readonly figures: readonly RangeFigure[];
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
  figures,
  windowDays,
  testId,
}: Props) {
  const bmi = bodyMassIndex(weightKg, heightCm);
  const radarAxes = figures.filter((figure) => figure.percent != null).slice(0, 5);

  return (
    <Card data-testid={testId ?? "demo-physiology-card"}>
      <div className="flex items-center justify-between gap-3">
        <LabelCaps icon={<span>◈</span>}>PHYSIO · 生理机能与跑力指标</LabelCaps>
        <span className="font-mono text-caption1 text-text-muted">
          相对本人近 {windowDays} 天区间
        </span>
      </div>

      <div className="mt-4 flex items-center gap-4">
        <div className="min-w-0 flex-1">
          <p className="text-caption1 text-text-muted">最大摄氧量 VO2max</p>
          {vo2max != null ? (
            <p className="mt-1 flex items-baseline gap-1">
              <span className="font-mono text-metric-lg font-bold tabular-nums text-accent">
                {vo2max.toFixed(1)}
              </span>
              <span className="text-caption1 text-text-muted">ml/kg/min</span>
            </p>
          ) : (
            <p className="mt-1 text-subheadline text-text-muted">{NO_VALUE}</p>
          )}
          <p className="mt-1 text-caption1 text-text-muted">
            {vo2maxSource ? `来源：${vo2maxSource}` : "设备未上报最大摄氧量"}
          </p>
        </div>
        <Radar axes={radarAxes} />
      </div>

      <div className="mt-4 grid grid-cols-2 gap-3">
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
 * 五维雷达：每一根轴是一个指标，位置是它在本人区间里的位置。
 *
 * 没有足够历史的轴不画：一条画不出位置的轴会把图形说成「这个指标没有数据」，
 * 而它其实有数据，只是这个指标没有历史可参照。
 */
function Radar({ axes }: { readonly axes: readonly RangeFigure[] }) {
  if (axes.length < 3) {
    return (
      <div className="grid size-24 shrink-0 place-items-center rounded-full bg-surface-overlay">
        <span className="px-2 text-center text-caption1 text-text-muted">
          区间不足
        </span>
      </div>
    );
  }
  const size = 96;
  const center = size / 2;
  const radius = center - 8;
  const points = axes.map((axis, index) => {
    const angle = (Math.PI * 2 * index) / axes.length - Math.PI / 2;
    const ratio = (axis.percent ?? 0) / 100;
    return {
      label: axis.label,
      x: center + Math.cos(angle) * radius * ratio,
      y: center + Math.sin(angle) * radius * ratio,
      edgeX: center + Math.cos(angle) * radius,
      edgeY: center + Math.sin(angle) * radius,
    };
  });
  const polygon = points.map((point) => `${point.x.toFixed(1)},${point.y.toFixed(1)}`).join(" ");
  const edge = axes
    .map((_, index) => {
      const angle = (Math.PI * 2 * index) / axes.length - Math.PI / 2;
      return `${(center + Math.cos(angle) * radius).toFixed(1)},${(center + Math.sin(angle) * radius).toFixed(1)}`;
    })
    .join(" ");

  return (
    <svg
      aria-label="本人区间里的能力位置"
      viewBox={`0 0 ${size} ${size}`}
      className="size-24 shrink-0"
      role="img"
    >
      <polygon
        points={edge}
        fill="none"
        stroke="var(--color-surface-active)"
        strokeWidth="1"
      />
      <polygon
        points={polygon}
        fill="var(--color-accent)"
        fillOpacity="0.18"
        stroke="var(--color-accent)"
        strokeWidth="1.8"
      />
    </svg>
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
