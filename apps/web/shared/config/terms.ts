import { TERMS_ACTIVITY } from "./terms-activity";
import { TERMS_LOAD } from "./terms-load";
import { TERMS_PHYSIOLOGY } from "./terms-physiology";

/**
 * 心率单位的唯一来源。
 *
 * 活动详情页的读数条一度写 `次/分`，而同页的分段表、圈段表跟着
 * `formatHeartRate` 写 `bpm`——一页两种拼法，读起来像两个产品。单位只在这里
 * 定义一次，所有展示心率单位的地方都从这里取。选 `bpm` 的理由：全站已有二十
 * 余处显示 `bpm`，换成中文单位是更大的改动；而且 12px 的单位列里 `bpm` 比
 * `次/分` 窄，不会把分段行的宽度顶出去。
 */
export const HEART_RATE_UNIT = "bpm";

/**
 * Professional bilingual terms for all metrics and physiology concepts.
 * Every entry now includes:
 *   - summary: one-sentence clear definition
 *   - reference: reference range / zone
 *   - note: scientific method + limitations
 *
 * Entries live in terms-load / terms-activity / terms-physiology to keep
 * each file under the 250 LOC gate.
 */

export interface TermExplanation {
  summary: string;
  reference?: string;
  note?: string;
  shortMeaning?: string;
}

export interface TermGlossary {
  label: string;
  explanation: TermExplanation;
}

export const TERMS = {
  ...TERMS_LOAD,
  ...TERMS_ACTIVITY,
  ...TERMS_PHYSIOLOGY,
} as const;

export type TermKey = keyof typeof TERMS;

/** 获取术语的中文显示名 */
export function termLabel(key: keyof typeof TERMS, showAbbr = true): string {
  const t = TERMS[key];
  if (typeof t === "string") return t;
  if (showAbbr) return `${t.label}(${key})`;
  return t.label;
}

/** 获取术语的结构化说明 */
export function termExplain(key: keyof typeof TERMS): TermExplanation {
  const t = TERMS[key];
  if (typeof t === "string") return { summary: "" };
  return t.explanation;
}
