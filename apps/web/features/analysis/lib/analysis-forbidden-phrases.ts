// Shared FORBIDDEN_PHRASES list + audit helper used by every Analysis copy
// surface. Splitting this from the executive-summary keeps both files within
// the 250 pure-LOC gate while keeping a single source of truth for the
// phrase list.

export const ANALYSIS_FORBIDDEN_PHRASES: readonly string[] = [
  "造成",
  "保证",
  "guarantees",
  "will prevent",
  "caused by",
  "医学诊断",
  "guarantee recovery",
  "obviously",
  "definitely",
];

export function assertNoForbiddenPhrases(label: string, text: string): void {
  for (const phrase of ANALYSIS_FORBIDDEN_PHRASES) {
    if (text.toLowerCase().includes(phrase.toLowerCase())) {
      throw new Error(
        `Analysis copy contains forbidden phrase "${phrase}" at ${label}: ${text}`,
      );
    }
  }
}
