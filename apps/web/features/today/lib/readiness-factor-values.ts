/**
 * 准备度因子的读数：把 wellness 与 pmc 两路时序压成五个固定格子。
 *
 * 接口的 `readiness.factors[].detail` 是整句话，形如「睡眠 3.7h，7日均值 0.9h」——
 * 它适合当解释，不适合当读数。那句话保留在格子悬停的 `title` 里（由卡片负责），
 * 版面上一律印数值，所以数值在这里自己算：末点为当前值，之前最多 7 个有值点的
 * 平均为基准。原文供对照：
 *
 *   睡眠 3.7h，7日均值 0.9h / 静息心率 48，7日均值 51 / HRV 62，7日均值 58
 *   负荷平衡 -3.2 / 疲劳变化 +1.8
 *
 * 缺值写 null，不写 0：没测到和测到 0 是两件事，印成 0 会让读者以为有读数。
 * 基准不足（有值点少于两个）时 note 为 null，但 value 照常显示——单点也是一次测量。
 */

import { HEART_RATE_UNIT } from "@shared/config/terms";

export type ReadinessFactorKey = "sleep" | "resting_hr" | "hrv" | "tsb" | "atl_velocity";

export interface FactorReading {
  readonly key: ReadinessFactorKey;
  readonly label: string;
  /** 读数本身；缺输入时为 null，调用方显示「未记录」。 */
  readonly value: string | null;
  /** 单位；`h m` 格式与无量纲的 TSB 不写单位。 */
  readonly unit: string | null;
  /** 与基准的差，一句话；基准不足或数字本身带方向时按下面的规则写。 */
  readonly note: string | null;
}

/** `useWellness` 返回的点，只取这里要的三列。 */
interface WellnessLike {
  readonly day: string;
  readonly sleep_secs: number | null;
  readonly resting_hr: number | null;
  readonly hrv: number | null;
}

/** `usePmcData` 返回的点。 */
interface PmcLike {
  readonly day: string;
  readonly atl: number;
  readonly tsb: number;
}

export interface ReadinessFactorInput {
  readonly wellness: ReadonlyArray<WellnessLike>;
  readonly pmc: ReadonlyArray<PmcLike>;
}

const BASELINE_DAYS = 7;
const BASELINE_LABEL = `${BASELINE_DAYS} 日均值`;

/** PMC 逐日一点（`pmc_facts` 按天写），所以往回数 7 个点就是 7 日前。 */
const SEVEN_DAYS_BACK = 7;

/** 疲劳上升或回落的判定阈值，写在 ATL 的日变化上。 */
const ATL_MOVING = 2;

const LABEL: Record<ReadinessFactorKey, string> = {
  sleep: "睡眠",
  resting_hr: "静息心率",
  hrv: "HRV",
  tsb: "状态 TSB",
  atl_velocity: "疲劳 ATL",
};

/** 一列里所有有值的点，保持时间顺序。 */
function numericColumn<T>(points: readonly T[], pick: (point: T) => number | null): number[] {
  const values: number[] = [];
  for (const point of points) {
    const value = pick(point);
    if (value != null && Number.isFinite(value)) values.push(value);
  }
  return values;
}

/**
 * 基准：当前点之前最多 7 个有值点的平均。
 *
 * 少于两个有值点就没有可比的东西，返回 null——把孤零零一个点当作基准，
 * note 永远写「持平」，读者会以为趋势是稳的。
 */
function baselineOf(values: ReadonlyArray<number>): number | null {
  if (values.length < 2) return null;
  const previous = values.slice(-1 - BASELINE_DAYS, -1);
  const sum = previous.reduce((total, value) => total + value, 0);
  return sum / previous.length;
}

/** `高于 7 日均值 22 分钟` / `低于 …` / `与 7 日均值持平`。 */
function driftNote(diff: number, suffix: string): string {
  if (diff === 0) return `与 ${BASELINE_LABEL}持平`;
  const direction = diff > 0 ? "高于" : "低于";
  return `${direction} ${BASELINE_LABEL} ${Math.abs(diff)}${suffix}`;
}

/** 保留一位小数，负数自带符号。 */
function decimal(value: number): string {
  return (Math.round(value * 10) / 10).toFixed(1);
}

/** 带正负号的差值，`+6.2` / `-3.1`。 */
function signed(value: number): string {
  const rounded = Math.round(value * 10) / 10;
  return `${rounded < 0 ? "-" : "+"}${Math.abs(rounded).toFixed(1)}`;
}

/** `7h42m`：分钟补零，跨小时不写成 `462m`。 */
function clockDuration(secs: number): string {
  const minutes = Math.round(secs / 60);
  return `${Math.floor(minutes / 60)}h${String(minutes % 60).padStart(2, "0")}m`;
}

function absent(key: ReadinessFactorKey): FactorReading {
  return { key, label: LABEL[key], value: null, unit: null, note: null };
}

function integerReading(
  key: ReadinessFactorKey,
  unit: string,
  points: ReadonlyArray<WellnessLike>,
  pick: (point: WellnessLike) => number | null,
): FactorReading {
  const values = numericColumn(points, pick);
  const current = values.length > 0 ? values[values.length - 1] : null;
  if (current == null) return absent(key);
  const baseline = baselineOf(values);
  return {
    key,
    label: LABEL[key],
    value: String(Math.round(current)),
    unit,
    note: baseline == null ? null : driftNote(Math.round(current - baseline), ""),
  };
}

function sleepReading(points: ReadonlyArray<WellnessLike>): FactorReading {
  const values = numericColumn(points, (point) => point.sleep_secs);
  const current = values.length > 0 ? values[values.length - 1] : null;
  if (current == null) return absent("sleep");
  const baseline = baselineOf(values);
  return {
    key: "sleep",
    label: LABEL.sleep,
    value: clockDuration(current),
    unit: null,
    note:
      baseline == null
        ? null
        : driftNote(Math.round((current - baseline) / 60), " 分钟"),
  };
}

/** 最后一点与 7 日前的同一个点；历史不够 8 个点就没有可比对象。 */
function weekAgo<T>(points: ReadonlyArray<T>): { readonly last: T; readonly before: T } | null {
  if (points.length <= SEVEN_DAYS_BACK) return null;
  const last = points[points.length - 1];
  const before = points[points.length - 1 - SEVEN_DAYS_BACK];
  if (last === undefined || before === undefined) return null;
  return { last, before };
}

function tsbReading(points: ReadonlyArray<PmcLike>): FactorReading {
  const latest = points.length > 0 ? points[points.length - 1] : undefined;
  if (latest === undefined) return absent("tsb");
  const pair = weekAgo(points);
  return {
    key: "tsb",
    label: LABEL.tsb,
    value: decimal(latest.tsb),
    unit: null,
    note: pair == null ? null : `较 ${BASELINE_DAYS} 日前 ${signed(pair.last.tsb - pair.before.tsb)}`,
  };
}

function atlVelocityReading(points: ReadonlyArray<PmcLike>): FactorReading {
  const pair = weekAgo(points);
  if (pair == null) return absent("atl_velocity");
  const delta = pair.last.atl - pair.before.atl;
  return {
    key: "atl_velocity",
    label: LABEL.atl_velocity,
    value: signed(delta),
    unit: null,
    note:
      delta > ATL_MOVING ? "上升较快" : delta < -ATL_MOVING ? "正在回落" : "基本平稳",
  };
}

/** 五个因子，顺序固定：恢复信号在前，负荷信号在后。 */
export function readinessFactorValues(input: ReadinessFactorInput): readonly FactorReading[] {
  return [
    sleepReading(input.wellness),
    integerReading("resting_hr", HEART_RATE_UNIT, input.wellness, (point) => point.resting_hr),
    integerReading("hrv", "ms", input.wellness, (point) => point.hrv),
    tsbReading(input.pmc),
    atlVelocityReading(input.pmc),
  ];
}
