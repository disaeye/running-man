// api-check.mjs
// Verifies that generated API clients are up-to-date with the OpenAPI spec.
// The check snapshots generated content, runs Orval, then compares content.

import { execSync } from "node:child_process";
import { createHash } from "node:crypto";
import { readdirSync, readFileSync, existsSync } from "node:fs";
import { join, relative } from "node:path";

const GENERATED_DIR = "shared/api/generated";

function listFiles(dir) {
  if (!existsSync(dir)) return [];
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const path = join(dir, entry.name);
    return entry.isDirectory() ? listFiles(path) : [path];
  });
}

function snapshot() {
  const result = new Map();
  for (const path of listFiles(GENERATED_DIR).sort()) {
    const key = relative(GENERATED_DIR, path);
    result.set(key, createHash("sha256").update(readFileSync(path)).digest("hex"));
  }
  return result;
}

function changedPaths(before, after) {
  const keys = [...new Set([...before.keys(), ...after.keys()])].sort();
  return keys.filter((key) => before.get(key) !== after.get(key));
}

try {
  execSync("git rev-parse --git-dir", { stdio: "ignore" });
} catch {
  console.error("Not in a git repository");
  process.exit(1);
}

if (!existsSync(GENERATED_DIR)) {
  console.error(
    `Generated directory ${GENERATED_DIR} does not exist. Run 'pnpm api:generate' first.`
  );
  process.exit(1);
}

console.log("Checking if API clients are up-to-date...");

const before = snapshot();
try {
  execSync("npm run api:generate --silent", { stdio: "pipe" });
} catch (error) {
  console.error("API client generation failed");
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
}
const after = snapshot();
const changed = changedPaths(before, after);

if (changed.length > 0) {
  console.error("\n❌ Generated API clients are out of sync with the OpenAPI spec.\n");
  console.error("Changes detected:");
  for (const path of changed.slice(0, 40)) console.error(path);
  if (changed.length > 40) console.error(`... and ${changed.length - 40} more`);
  console.error("\nRun 'pnpm api:generate' and commit the changes.");
  process.exit(1);
}

console.log("✓ Generated API clients are up-to-date");
