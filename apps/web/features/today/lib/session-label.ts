/**
 * 后端机读字符串 → 界面文字。
 *
 * 强度、训练类型、处方分段这三套枚举分别来自 recommendation、calendar 和
 * workout_prescription 三处响应。文案集中在这一张表里，同一个后端取值在任何页面
 * 上只有一种说法，改文案也只动这一处。
 *
 * 强度查不到时原样返回，不返回空串：界面上出现一个 `Z9` 才能看出是映射漏了。
 * 课型不走这条路——它会退回运动类型或默认词，理由见 `workoutTypeLabel`。
 */

import { getSportConfig } from "@shared/config/sport-config";

const INTENSITY_LABEL: Record<string, string> = {
  high: "Z4",
  moderate: "Z2",
  low: "Z1",
  none: "恢复",
};

/**
 * 课型表：键名与后端取值逐字一致。
 *
 * `rest` / `easy` / `long` / `tempo` / `intervals` / `recovery` 来自
 * `domain/workout/prescription.py`，也是分段 `type` 会出现的取值；`quality` 与
 * `endurance` 来自 `domain/insights/recommendation.py` 没排计划时的选择。
 * `tempo`、`long`、`intervals` 照课表页既有译法写，别处不许另造一套。
 */
const WORKOUT_TYPE_LABEL: Record<string, string> = {
  easy: "轻松跑",
  long: "长距离跑",
  tempo: "节奏跑",
  intervals: "间歇跑",
  threshold: "阈值跑",
  interval: "间歇跑",
  repetition: "重复跑",
  marathon: "马拉松配速",
  endurance: "有氧耐力",
  quality: "质量课",
  recovery: "恢复跑",
  rest: "休息",
};

const SEGMENT_FIXED_LABEL: Record<string, string> = {
  warmup: "热身",
  cooldown: "放松",
};

/** 课型表与运动表都不认得时用的默认词。 */
const WORKOUT_TYPE_FALLBACK = "训练";

/** 处方分段类型：热身、放松各有固定说法，中间的质量段按课型表翻。 */
const SEGMENT_FALLBACK = "训练段";

/** `high` / `moderate` / `low` / `none` → 区间代号。 */
export function intensityLabel(intensity: string): string {
  return INTENSITY_LABEL[intensity] ?? intensity;
}

/** 注册表认得才算运动类型；`其他运动` 就是注册表的兜底，视同不认识。 */
function sportLabel(type: string): string | null {
  const config = getSportConfig(type);
  return config.family === "unknown" ? null : config.label;
}

/**
 * `easy` / `tempo` / `intervals` … → 课型名，依次判定三条：
 *
 * 1. 课型表命中就用课型名。
 * 2. 未命中时看它是不是运动类型：排了计划的日子，`workout_type` 装的是
 *    `sport_type`（`Run`、`Ride`），这时用运动标签「跑步」。
 * 3. 两条都不认识才用默认词「训练」。
 *
 * 第一档给的是课型本身的说法；第二档接住排了计划的日子——那些天的
 * `workout_type` 装的是运动类型而不是课型；第三档保证任何取值都有词可拼成标题。
 * 运动标签一律走 `getSportConfig`，不在这里手写 `Run → 跑步`。
 */
export function workoutTypeLabel(type: string): string {
  return WORKOUT_TYPE_LABEL[type] ?? sportLabel(type) ?? WORKOUT_TYPE_FALLBACK;
}

/**
 * 处方里的一个分段。
 *
 * 质量段不另立一张表，直接读课型表：`threshold` 段就是阈值跑那一段，
 * 两处各写一份迟早会分叉。两处都取不到才写「训练段」——那一段确实是训练内容，
 * 只是没有对应的类型名，所以不说具体是什么课。
 */
export function segmentLabel(type: string): string {
  return SEGMENT_FIXED_LABEL[type] ?? WORKOUT_TYPE_LABEL[type] ?? SEGMENT_FALLBACK;
}
