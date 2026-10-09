// kill-port.mjs
// Stop whatever is listening on a TCP port — safely, by port, never by name.
//
// Why this exists: `pkill -f "next-server"` (and `pkill -f "next start"`) are
// global fuzzy matches. Every Next.js app on the host presents the same
// `next-server (v16.3.1)` cmdline, so name-based kills take down unrelated
// servers — including the local pi-web UI. Ports are the only unique handle.
//
// Usage:
//   node scripts/kill-port.mjs 28801          # SIGTERM, then SIGKILL after timeout
//   node scripts/kill-port.mjs 28801 --signal SIGKILL
//   node scripts/kill-port.mjs 28801 --timeout 2000
//
// Exit codes: 0 = port free (killed and/or was already free), 1 = still occupied.

import { execFile } from "node:child_process";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

const DEFAULT_TIMEOUT_MS = 5_000;
const POLL_INTERVAL_MS = 100;

function parseArgs(argv) {
  const positionals = [];
  let signal = "SIGTERM";
  let timeoutMs = DEFAULT_TIMEOUT_MS;

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === "--signal") {
      signal = argv[++i] ?? "";
      if (!/^SIG[A-Z0-9]+$/.test(signal)) throw new Error("--signal must look like SIGTERM or SIGKILL.");
    } else if (arg === "--timeout") {
      const value = Number.parseInt(argv[++i] ?? "", 10);
      if (!Number.isSafeInteger(value) || value < 0) throw new Error("--timeout must be a non-negative integer (ms).");
      timeoutMs = value;
    } else if (arg === "--help" || arg === "-h") {
      positionals.push("--help");
    } else {
      positionals.push(arg);
    }
  }

  if (positionals.includes("--help")) return { help: true };

  const [rawPort, ...rest] = positionals;
  if (rest.length > 0) throw new Error(`Unexpected argument(s): ${rest.join(" ")}`);
  if (!/^\d+$/.test(rawPort ?? "")) throw new Error("Usage: node scripts/kill-port.mjs <port> [--signal SIGTERM] [--timeout 5000]");

  const port = Number.parseInt(rawPort, 10);
  if (port < 1 || port > 65535) throw new Error("Port must be between 1 and 65535.");

  return { help: false, port, signal, timeoutMs };
}

const HELP = `Usage: node scripts/kill-port.mjs <port> [options]

Stop the process listening on <port>. Never matches by process name, so it
cannot take down unrelated Next.js servers (e.g. pi-web on port 30141).

Options:
  --signal <SIG>     Signal to send first (default: SIGTERM)
  --timeout <ms>     Wait before escalating to SIGKILL (default: 5000)
  -h, --help         Show this help
`;

// Everything bound to the port on any local address. `-n tcp <port>` lists the
// PID even when the socket is owned by another user's process (where visible).
async function pidsOnPort(port) {
  try {
    // -n: numeric (no DNS), tcp <port>: port filter. Output: "30141/tcp: 1234 5678"
    const { stdout } = await execFileAsync("fuser", ["-n", "tcp", String(port)], { encoding: "utf8" });
    return stdout
      .split(":")
      .pop()
      .split(/\s+/)
      .map((value) => Number.parseInt(value, 10))
      .filter((pid) => Number.isSafeInteger(pid) && pid > 0);
  } catch (error) {
    // fuser exits 1 when nothing is found — that is the "port is free" case.
    if (error?.code === 1 || error?.stdout === "") return [];
    if (error?.code === "ENOENT") throw new Error("fuser is required but was not found on PATH.");
    // Exit code 1 with no stdout is "no process found"; anything else is real.
    if (typeof error?.code === "number") return [];
    throw error;
  }
}

async function describe(pid) {
  try {
    const { stdout } = await execFileAsync("ps", ["-p", String(pid), "-o", "user=,args="], { encoding: "utf8" });
    return stdout.trim().replace(/\s+/g, " ").slice(0, 160);
  } catch {
    return "(process details unavailable)";
  }
}

function isAlive(pid) {
  try {
    process.kill(pid, 0);
    return true;
  } catch (error) {
    return error?.code === "EPERM";
  }
}

async function waitForExit(pids, timeoutMs) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (pids.every((pid) => !isAlive(pid))) return true;
    await new Promise((resolve) => setTimeout(resolve, POLL_INTERVAL_MS));
  }
  return pids.every((pid) => !isAlive(pid));
}

async function main() {
  let options;
  try {
    options = parseArgs(process.argv.slice(2));
  } catch (error) {
    process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
    process.exit(1);
  }

  if (options.help) {
    process.stdout.write(HELP);
    return;
  }

  const { port, signal, timeoutMs } = options;
  const pids = await pidsOnPort(port);

  if (pids.length === 0) {
    process.stdout.write(`Port ${port} is free — nothing to stop.\n`);
    return;
  }

  for (const pid of pids) {
    process.stdout.write(`Stopping pid ${pid} on port ${port}: ${await describe(pid)}\n`);
  }

  const errors = [];
  for (const pid of pids) {
    try {
      process.kill(pid, signal);
    } catch (error) {
      if (error?.code !== "ESRCH") errors.push(`pid ${pid}: ${error.message}`);
    }
  }

  if (await waitForExit(pids, timeoutMs)) {
    process.stdout.write(`Port ${port} released.\n`);
    return;
  }

  const survivors = pids.filter(isAlive);
  process.stdout.write(`${signal} did not stop ${survivors.join(", ")} — escalating to SIGKILL.\n`);
  for (const pid of survivors) {
    try {
      process.kill(pid, "SIGKILL");
    } catch (error) {
      if (error?.code !== "ESRCH") errors.push(`pid ${pid}: ${error.message}`);
    }
  }

  if (!(await waitForExit(survivors, timeoutMs))) {
    process.stderr.write(`Port ${port} is still held by: ${survivors.filter(isAlive).join(", ")}\n`);
    process.exitCode = 1;
    return;
  }

  if (errors.length > 0) process.stderr.write(`${errors.join("\n")}\n`);
  process.stdout.write(`Port ${port} released.\n`);
}

void main();
