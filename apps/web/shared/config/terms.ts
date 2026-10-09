import { TERMS_ACTIVITY } from "./terms-activity";
import { TERMS_LOAD } from "./terms-load";
import { TERMS_PHYSIOLOGY } from "./terms-physiology";

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
