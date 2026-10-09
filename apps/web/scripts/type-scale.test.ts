// @vitest-environment node

/**
 * Type-scale gate — enforces the readable floor from DESIGN.md.
 *
 * Two failures this prevents, both of which shipped:
 *
 * 1. **Arbitrary sizes.** 61 places wrote `text-[9px]`, `text-[10px]` or
 *    `text-[11px]` instead of using a token. The design system's scale existed
 *    the whole time; bypassing it meant a global change to `caption1` did not
 *    reach a third of the small text on screen.
 *
 * 2. **Chinese below the floor.** The scale bottoms out at `caption2` (11px),
 *    which is legible for Latin labels like `CTL / FITNESS` but not for Chinese.
 *    CJK glyphs carry far more strokes per em; a rendered comparison at
 *    9/10/11/12/13px puts the crossover at 12px, below which 恢复评估 becomes a
 *    grey smudge. 63 Chinese elements were below it, including the labels of the
 *    home page's decision prescription.
 *
 * The fix was to re-tune the tokens to DESIGN.md — they had drifted a pixel low
 * across five steps — and to stop bypassing them. This gate keeps it that way.
 *
 * Why a scan-test rather than an ESLint rule: same reason as `hex-ban.test.ts`.
 * It is deterministic, runs in `npm run test`, and proves it catches what it
 * claims by asserting against synthetic sources.
 */
import { describe, expect, it } from "vitest";
import { readdirSync, readFileSync } from "node:fs";
import { join, sep } from "node:path";

const WEB_ROOT = process.cwd();
const SCAN_DIRS = ["app", "shared", "features"].map((d) => join(WEB_ROOT, d));

/** Below this, Chinese is not reliably legible. */
const CJK_FLOOR_PX = 12;

/** The token scale, in px. Mirrors `--text-*` in globals.css. */
const TOKEN_PX: Record<string, number> = {
  "text-caption2": 11,
  "text-caption1": 12,
  "text-footnote": 13,
  "text-subheadline": 13,
  "text-callout": 14,
  "text-body": 15,
  "text-headline": 15,
  "text-title3": 20,
  "text-title2": 22,
  "text-title1": 24,
  "text-largeTitle": 28,
};

const CJK = /[\u4e00-\u9fa5]/;

function sourceFiles(): string[] {
  const out: string[] = [];
  const walk = (dir: string): void => {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const full = join(dir, entry.name);
      if (entry.isDirectory()) {
        if (entry.name !== "node_modules" && entry.name !== "generated") walk(full);
      } else if (/\.tsx?$/.test(entry.name) && !/\.test\.tsx?$/.test(entry.name)) {
        out.push(full);
      }
    }
  };
  for (const dir of SCAN_DIRS) walk(dir);
  return out;
}

/**
 * Arbitrary `text-[13px]` values, ignoring the token-backed utilities.
 *
 * `type-scale-allow` suppresses a line. The one legitimate use is a wordmark
 * sized to its container rather than to the reading scale: "Running Man" in the
 * 240px sidebar truncates at `title3`, so it keeps an explicit 17px. A brand
 * mark is not prose and the scale does not govern it.
 */
const ALLOW_MARKER = "type-scale-allow";

function arbitrarySizes(source: string): { value: number; index: number }[] {
  const found: { value: number; index: number }[] = [];
  const re = /\btext-\[(\d+(?:\.\d+)?)px\]/g;
  let match: RegExpExecArray | null;
  while ((match = re.exec(source)) !== null) {
    // Look at the matched line and the two before it: an exemption usually
    // sits in a comment directly above the element it excuses.
    const lineStart = source.lastIndexOf("\n", match.index) + 1;
    const contextStart = Math.max(0, source.lastIndexOf("\n", Math.max(0, lineStart - 2)));
    if (source.slice(contextStart, match.index).includes(ALLOW_MARKER)) continue;
    found.push({ value: Number(match[1]), index: match.index });
  }
  return found;
}

/**
 * Class strings that apply a token size and whose element also contains Chinese.
 *
 * Deliberately textual rather than AST-based: the rule is about what a reader
 * sees, and the codebase's markup is one-element-per-line enough for the match
 * to be unambiguous. A false positive is a nudge to use a larger token, which is
 * the right direction anyway.
 */
function cjkBelowFloor(source: string): string[] {
  const offences: string[] = [];
  const re = /className="([^"]*\btext-caption2\b[^"]*)"[^>]*>([^<]{0,40})/g;
  let match: RegExpExecArray | null;
  while ((match = re.exec(source)) !== null) {
    const [, , text] = match;
    if (text && CJK.test(text)) offences.push(text.trim().slice(0, 24));
  }
  return offences;
}

describe("type scale", () => {
  it("has no arbitrary px font sizes", () => {
    const offenders: string[] = [];
    for (const file of sourceFiles()) {
      for (const { value } of arbitrarySizes(readFileSync(file, "utf8"))) {
        offenders.push(`${file.replace(WEB_ROOT + sep, "")}  text-[${value}px]`);
      }
    }
    expect(
      offenders,
      "Use a design token (text-caption2, text-caption1, …) instead of an arbitrary size",
    ).toEqual([]);
  });

  it("has no arbitrary size below the Chinese floor", () => {
    // Even if the token rule above is relaxed later, nothing may render Chinese
    // under 12px. This asserts the floor itself, independent of how it is spelled.
    const offenders: string[] = [];
    for (const file of sourceFiles()) {
      const source = readFileSync(file, "utf8");
      for (const { value, index } of arbitrarySizes(source)) {
        if (value >= CJK_FLOOR_PX) continue;
        const after = source.slice(index, index + 220);
        if (CJK.test(after)) offenders.push(`${file.replace(WEB_ROOT + sep, "")}  ${value}px`);
      }
    }
    expect(offenders, `Chinese must not render below ${CJK_FLOOR_PX}px`).toEqual([]);
  });

  it("does not set Chinese text at caption2", () => {
    const offenders: string[] = [];
    for (const file of sourceFiles()) {
      for (const text of cjkBelowFloor(readFileSync(file, "utf8"))) {
        offenders.push(`${file.replace(WEB_ROOT + sep, "")}  “${text}”`);
      }
    }
    expect(offenders, "caption2 is 11px — use caption1 for Chinese labels").toEqual([]);
  });

  it("keeps every token at or above the Chinese floor", () => {
    for (const [token, px] of Object.entries(TOKEN_PX)) {
      // caption2 is the documented exception: Latin-only micro-labels.
      if (token === "text-caption2") continue;
      expect(px, `${token} must not fall below the Chinese floor`).toBeGreaterThanOrEqual(
        CJK_FLOOR_PX,
      );
    }
  });
});

describe("type-scale scanner self-check", () => {
  it("catches an arbitrary size", () => {
    // Index is the offset of the `text-[9px]` match, not of the class attribute.
    expect(arbitrarySizes('<p className="text-[9px]">x</p>')).toEqual([{ value: 9, index: 14 }]);
  });

  it("catches Chinese at caption2", () => {
    expect(cjkBelowFloor('<p className="text-caption2">恢复评估</p>')).toEqual(["恢复评估"]);
  });

  it("allows Latin at caption2", () => {
    expect(cjkBelowFloor('<p className="text-caption2">CTL / FITNESS</p>')).toEqual([]);
  });

  it("allows Chinese at caption1", () => {
    expect(cjkBelowFloor('<p className="text-caption1">恢复评估</p>')).toEqual([]);
  });

  it("honours the allow marker", () => {
    // The marker sits in a comment directly above the element, which is how the
    // one legitimate use in the codebase is written.
    const allowed = [
      "line before",
      "  {/* type-scale-allow */}",
      '  <span className="text-[17px]">Running Man</span>',
    ].join("\n");
    expect(arbitrarySizes(allowed)).toEqual([]);

    const notAllowed = [
      "line before",
      '  <span className="text-[17px]">Running Man</span>',
    ].join("\n");
    expect(arbitrarySizes(notAllowed)).toHaveLength(1);
  });
});
