import { execFile } from "node:child_process";
import { readFile, stat } from "node:fs/promises";
import { resolve } from "node:path";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);
const SERVICE = "running-man-web.service";
const BASE_URL = "http://localhost:28801";
const BUILD_ID_PATH = resolve(process.cwd(), ".next/BUILD_ID");

async function command(command, args) {
  return execFileAsync(command, args, { encoding: "utf8" });
}

async function serviceMainPid() {
  const { stdout } = await command("systemctl", ["--user", "show", "--property=MainPID", "--value", SERVICE]);
  const pid = Number.parseInt(stdout.trim(), 10);
  if (!Number.isSafeInteger(pid) || pid <= 0) throw new Error("service has no main process");
  return pid;
}

async function assertServiceProcess(pid) {
  const { stdout } = await command("ps", ["-p", String(pid), "-o", "user=,args="]);
  const [owner = "", ...details] = stdout.trim().split(/\s+/);
  if (!owner || !details.join(" ").includes("next-server")) throw new Error("service process is not Next start");
  return owner;
}

async function assertCurrentBuild() {
  const [buildId, buildStat] = await Promise.all([readFile(BUILD_ID_PATH, "utf8"), stat(BUILD_ID_PATH)]);
  if (!buildId.trim() || buildStat.mtimeMs <= 0) throw new Error("current build marker is unavailable");
  return buildStat.mtimeMs;
}

async function assertBuildPredatesService(pid, buildModifiedAt) {
  const processStat = await stat(`/proc/${pid}`);
  if (buildModifiedAt > processStat.ctimeMs) throw new Error("current build is newer than the running service");
}

async function assertHealthy() {
  const response = await fetch(BASE_URL, { redirect: "manual", signal: AbortSignal.timeout(10_000) });
  if (!response.ok) throw new Error(`service health returned ${response.status}`);
  return response.status;
}

async function main() {
  try {
    const { stdout } = await command("systemctl", ["--user", "is-active", SERVICE]);
    if (stdout.trim() !== "active") throw new Error("service is inactive");
    const pid = await serviceMainPid();
    const [owner, statusCode, buildModifiedAt] = await Promise.all([assertServiceProcess(pid), assertHealthy(), assertCurrentBuild()]);
    await assertBuildPredatesService(pid, buildModifiedAt);
    process.stdout.write(JSON.stringify({ ok: true, serviceActive: true, processOwned: Boolean(owner), portHealthy: statusCode === 200, currentBuild: true }) + "\n");
  } catch (error) {
    process.stderr.write(`${error instanceof Error ? error.message : "service preflight failed"}\n`);
    process.exitCode = 1;
  }
}

void main();
