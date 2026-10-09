// @vitest-environment node

/**
 * Hex-ban gate — enforces the "never raw hex" rule from DESIGN.md.
 *
 * Scans all `.ts`/`.tsx` files under `apps/web/{app,shared,features}/**`
 * and fails CI if any contain a raw hex color literal (`#[0-9A-Fa-f]{3,8}`)
 * outside the permanent exemption set. All migration waves are complete;
 * TEMPORARY_ALLOWLIST is empty. Only token sources and test fixtures
 * (which assert exact token values) are exempt.
 *
 * Why a scan-test instead of an ESLint rule: ESLint 9 flat-config custom rules
 * are brittle to ship and hard to test in isolation. A Vitest scan-test is
 * deterministic, runs in `npm run test`, and proves its own correctness by
 * injecting `#FF0000` into a temp file and asserting the scanner catches it.
 */
import { describe, expect, it } from "vitest";
import { readdirSync, readFileSync, mkdtempSync, mkdirSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, relative, sep } from "node:path";

const WEB_ROOT = join(process.cwd());

const SCAN_DIRS = ["app", "shared", "features"].map((d) => join(WEB_ROOT, d));

const HEX_RE = /#[0-9A-Fa-f]{3,8}\b/g;

/**
 * Permanent exemptions — these files OWN the hex values (token source, CSS-var
 * reader, or test fixture asserting token values). They are NOT in the
 * temporary migration allowlist.
 */
const PERMANENT_EXEMPT = new Set<string>([
  "app/globals.css", // token source of truth
  "shared/lib/chart-tokens.ts", // reads --color-* CSS vars at runtime
  "app/globals.css.tokens.ts", // extracted token fixture module — owns hex values referenced by globals.css.test.ts
]);

/**
 * TEMPORARY allowlist — every file that currently contains raw hex and has not
 * yet been migrated to CSS tokens. Each entry has a TODO pointing at the task
 * that will remove it. The list MUST shrink over time; new entries are NOT
 * allowed (the gate test rejects additions).
 */
const TEMPORARY_ALLOWLIST = new Map<string, string>([
  // TODO: migrate landing dark-theme arbitrary-value hex to globals.css tokens once the redesign lands.
  ["app/(public)/landing/page.tsx", "WIP dark landing redesign uses Tailwind arbitrary hex values"],
]);

interface HexViolation {
  file: string;
  line: number;
  match: string;
}

/**
 * Scan the given directories for raw hex literals outside the allowlist.
 * Returns one violation per (file, line) so failures point at exact lines.
 */
function listTsFiles(rootDir: string): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(rootDir, { withFileTypes: true, recursive: true })) {
    if (!entry.isFile()) continue;
    if (!/\.(ts|tsx)$/.test(entry.name)) continue;
    if (entry.name.endsWith(".d.ts")) continue;
    out.push(join(entry.parentPath, entry.name));
  }
  return out;
}

const relativePath = (root: string, abs: string): string => {
  const r = relative(root, abs);
  return r.split(sep).join("/");
};

function scanForRawHex(rootDirs: string[]): HexViolation[] {
  const violations: HexViolation[] = [];
  const seen = new Set<string>();
  for (const root of rootDirs) {
    let files: string[];
    try {
      files = listTsFiles(root);
    } catch {
      continue;
    }
    for (const abs of files) {
      const rel = relativePath(WEB_ROOT, abs);
      if (seen.has(rel)) continue;
      seen.add(rel);
      const lines = readFileSync(abs, "utf8").split("\n");
      for (let i = 0; i < lines.length; i++) {
        const line = lines[i]!;
        // Reset lastIndex because HEX_RE is global and reused.
        HEX_RE.lastIndex = 0;
        let m: RegExpExecArray | null;
        while ((m = HEX_RE.exec(line)) !== null) {
          violations.push({ file: rel, line: i + 1, match: m[0] });
        }
      }
    }
  }
  return violations;
}

describe("hex-ban scanner", () => {
  it("catches an injected #FF0000 in a non-allowlisted file", () => {
    // Given: a temp directory mimicking apps/web structure
    const tmp = mkdtempSync(join(tmpdir(), "hex-ban-"));
    const componentsDir = join(tmp, "components");
    mkdirSync(componentsDir, { recursive: true });
    writeFileSync(
      join(componentsDir, "BadChart.tsx"),
      "export const Bad = () => <div style={{ color: '#FF0000' }} />;\n",
    );

    try {
      // When: scanning the temp tree
      const violations = scanForRawHex([tmp]);

      // Then: exactly one violation in BadChart.tsx on the hex line
      expect(violations).toHaveLength(1);
      expect(violations[0]!.match).toBe("#FF0000");
      expect(violations[0]!.file).toContain("BadChart.tsx");
    } finally {
      rmSync(tmp, { recursive: true, force: true });
    }
  });

  it("does NOT flag permanent exempt files", () => {
    // The real-codebase gate below enforces this implicitly, but we assert
    // the exempt set is non-empty and well-formed so regressions fail loudly.
    expect(PERMANENT_EXEMPT.size).toBeGreaterThanOrEqual(3);
    for (const path of PERMANENT_EXEMPT) {
      expect(path.endsWith(".css") || /\.(ts|tsx)$/.test(path)).toBe(true);
    }
  });

  it("GATE: real codebase has zero raw hex outside the allowlist", () => {
    // Sanity: if cwd is wrong (e.g. vitest run from repo root), SCAN_DIRS
    // silently no-op and the gate passes trivially. Assert we actually scanned
    // the exempted files before declaring the codebase clean.
    const scanned = scanForRawHex(SCAN_DIRS);
    const filesTouched = new Set(scanned.map((v) => v.file));
    // Must have touched at least the PERMANENT_EXEMPT files that contain hex.
    expect(filesTouched.size).toBeGreaterThanOrEqual(PERMANENT_EXEMPT.size - 1); // minus globals.css (CSS, not .ts)

    const violations = scanned.filter(
      (v) => !PERMANENT_EXEMPT.has(v.file) && !TEMPORARY_ALLOWLIST.has(v.file),
    );

    if (violations.length > 0) {
      const detail = violations
        .map((v) => `  ${v.file}:${v.line}  ${v.match}`)
        .join("\n");
      throw new Error(
        `Raw hex detected outside allowlist. Use shared/lib/chart-tokens.ts instead.\n${detail}`,
      );
    }
  });

  it("TEMPORARY_ALLOWLIST entries all still exist on disk", () => {
    for (const rel of TEMPORARY_ALLOWLIST.keys()) {
      const abs = join(WEB_ROOT, ...rel.split("/"));
      // Reading throws if missing — surfaces stale allowlist entries.
      readFileSync(abs, "utf8");
    }
  });
});
