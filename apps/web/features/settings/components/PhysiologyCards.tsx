"use client";

import { useMemo } from "react";
import { Card } from "@shared/ui/Card";
import { CardHeader } from "@shared/ui/CardHeader";
import { InsetBlock } from "@shared/ui/InsetBlock";
import { ProgressRow } from "@shared/ui/ProgressRow";
import type { UserProfile } from "@shared/lib/auth";
import { HEART_RATE_UNIT } from "@shared/config/terms";
import { athleteRange, useAthleteTimezone } from "@shared/lib/training-day";
import { useWellness, type WellnessPoint } from "@features/health/hooks/useWellness";
import { useAbility } from "@features/today/hooks/useAbility";

/** 缺值文案，和身份卡同一个词。 */
const UNRECORDED = "未记录";

/**
 * 生理指标读最近 42 天。最大摄氧量按周随训练上报，窗口再短就会常常读空；
 * 体重、体脂跟着同一个窗口走，一张卡只发一次请求。
 */
const WINDOW_DAYS = 42;

/** VDOT 60 大致是精英级；按 60 折成百分比，超出封顶 100。 */
const VDOT_CEILING = 60;

type WellnessField = "vo2max" | "weight" | "body_fat_pct";

/** 窗口里最后一个非空读数。`useWellness` 按天升序返回，所以从尾部往前找。 */
function lastRecorded(
  points: ReadonlyArray<WellnessPoint>,
  field: WellnessField,
): number | null {
  for (let index = points.length - 1; index >= 0; index -= 1) {
    const value = points[index]?.[field] ?? null;
    if (value != null) return value;
  }
  return null;
}

function fixed1(value: number | null): string | null {
  return value == null ? null : value.toFixed(1);
}

/** 卡内的一格：12px 标签加读数，缺值写「未记录」，不印 0。 */
function PhysiologyCell({
  label,
  value,
  unit,
}: {
  readonly label: string;
  readonly value: string | null;
  readonly unit: string;
}) {
  return (
    <InsetBlock>
      <p className="text-caption1 text-text-muted">{label}</p>
      {value == null ? (
        <p className="mt-1 text-caption1 text-text-muted">{UNRECORDED}</p>
      ) : (
        <p className="mt-1 flex items-baseline gap-1">
          <span className="font-mono text-title2 font-semibold tabular-nums text-text-primary">
            {value}
          </span>
          <span className="text-caption1 text-text-muted">{unit}</span>
        </p>
      )}
    </InsetBlock>
  );
}

/**
 * 档案页的第二张卡：最大摄氧量、两项能力比例，加上四项基础读数。
 *
 * 直径环（`RingStat`）在这里是错的形状：VDOT 只有一个数，画两个环等于把同一个
 * 事实说两遍还占了半张卡。两根细条给的是「离这个刻度的上限还有多远」，
 * 和环一样的语义，但只占一行。
 *
 * 数据来源写在头部的 `trailing` 上：这四个读数来自手表同步，不是这里填的。
 */
export function PhysiologyCards({ profile }: { readonly profile: UserProfile | null }) {
  const timezone = useAthleteTimezone();
  const range = useMemo(() => athleteRange(WINDOW_DAYS, timezone), [timezone]);
  const wellness = useWellness(range.from, range.to);
  const ability = useAbility();

  const vo2max = lastRecorded(wellness.data, "vo2max");
  const weight = lastRecorded(wellness.data, "weight");
  const bodyFat = lastRecorded(wellness.data, "body_fat_pct");

  const vdot = ability.data?.vdot ?? null;
  const vdotRatio =
    vdot == null ? null : Math.round(Math.min(100, (vdot / VDOT_CEILING) * 100));

  // 这句话是个断言，只能在真的读到空值时才说：读取中或请求失败的时候说
  // 「手表没有上报」是另一个事实，而且是错的。
  const vo2maxMissing = !wellness.loading && wellness.error == null && vo2max == null;

  return (
    <Card padding="md" data-testid="physiology-cards">
      <CardHeader
        title="生理指标"
        trailing={<span className="text-caption1 text-text-muted">Intervals.icu</span>}
      />

      <div className="grid min-w-0 gap-5 sm:grid-cols-2 sm:gap-6">
        <div className="min-w-0">
          <div className="flex items-baseline gap-1.5">
            <span
              className={`font-mono text-metric-xl font-semibold tabular-nums ${
                vo2max == null ? "text-text-muted" : "text-text-primary"
              }`}
            >
              {vo2max == null ? UNRECORDED : Math.round(vo2max)}
            </span>
            {vo2max == null ? null : (
              <span className="text-caption1 text-text-muted">ml/kg/min</span>
            )}
          </div>
          <p className="mt-1 text-caption1 text-text-muted">最大摄氧量</p>
          {vo2maxMissing ? (
            <p className="mt-1 text-caption1 text-text-muted">手表没有上报最大摄氧量</p>
          ) : null}
        </div>

        {vdotRatio == null ? null : (
          <div className="min-w-0 space-y-3">
            <ProgressRow label="有氧基础" value={vdotRatio} />
            <ProgressRow label="阈值耐力" value={vdotRatio} />
          </div>
        )}
      </div>

      <div className="mt-5 grid grid-cols-2 gap-2 sm:gap-3">
        <PhysiologyCell
          label="静息心率"
          value={profile?.resting_hr == null ? null : String(profile.resting_hr)}
          unit={HEART_RATE_UNIT}
        />
        <PhysiologyCell
          label="乳酸阈心率"
          value={profile?.lthr == null ? null : String(profile.lthr)}
          unit={HEART_RATE_UNIT}
        />
        <PhysiologyCell label="体重" value={fixed1(weight)} unit="kg" />
        <PhysiologyCell label="体脂率" value={fixed1(bodyFat)} unit="%" />
      </div>
    </Card>
  );
}
