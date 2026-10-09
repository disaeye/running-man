// api-check.mjs
// Verifies that generated API clients are up-to-date with the OpenAPI spec.
// Runs `orval --config` and checks git status for changes to the generated dir.

import { execSync } from "node:child_process";
import { existsSync } from "node:fs";

const GENERATED_DIR = "shared/api/generated";

// Check if we're in a git repo
try {
  execSync("git rev-parse --git-dir", { stdio: "ignore" });
} catch {
  console.error("Not in a git repository");
  process.exit(1);
}

// Check if generated dir exists
if (!existsSync(GENERATED_DIR)) {
  console.error(
    `Generated directory ${GENERATED_DIR} does not exist. Run 'pnpm api:generate' first.`
  );
  process.exit(1);
}

console.log("Checking if API clients are up-to-date...");

// Run orval in quiet mode
execSync("npm run api:generate --silent", { stdio: "pipe" });

// Check git status for changes in generated dir
const status = execSync(`git status --porcelain ${GENERATED_DIR}`, {
  encoding: "utf-8",
}).trim();

if (status) {
  console.error(
    "\n❌ Generated API clients are out of sync with the OpenAPI spec.\n"
  );
  console.error("Changes detected:");
  console.error(status);
  console.error("\nRun 'pnpm api:generate' and commit the changes.");
  process.exit(1);
}

console.log("✓ Generated API clients are up-to-date");
