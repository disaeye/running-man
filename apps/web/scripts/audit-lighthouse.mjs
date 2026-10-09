import { execFile } from "node:child_process";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { promisify } from "node:util";
import { launch } from "chrome-launcher";
import lighthouse from "lighthouse";

const execFileAsync = promisify(execFile);
const BASE_URL = "http://localhost:28801";
const AUTH_FILE = "e2e/.auth/storageState.json";
const RUNS = 3;
const EVIDENCE_DIR = "../../.omo/evidence/frontend-product-experience-redesign/implementation/task-15-frontend-product-experience-redesign";
const AUDIT_ROUTES = [
  { path: "/landing", kind: "public" }, { path: "/login", kind: "public" }, { path: "/register", kind: "public" },
  { path: "/_not-found", kind: "not-found" }, { path: "/", kind: "authenticated" }, { path: "/calendar?view=week", kind: "authenticated" },
  { path: "/calendar?view=list", kind: "authenticated" }, { path: "/analysis", kind: "authenticated" }, { path: "/analysis?tab=performance", kind: "authenticated" },
  { path: "/goals", kind: "authenticated" }, { path: "/settings?section=data", kind: "authenticated" }, { path: "/settings?section=strength", kind: "authenticated" },
];
const CATEGORY_LABELS = {
  accessibility: "accessibility",
  "best-practices": "best-practices",
  performance: "performance",
  seo: "seo",
};
const DESKTOP_SETTINGS = {
  formFactor: "desktop",
  screenEmulation: { mobile: false, width: 1350, height: 940, deviceScaleFactor: 1, disabled: false },
  throttling: {
    rttMs: 40,
    throughputKbps: 10240,
    cpuSlowdownMultiplier: 1,
    requestLatencyMs: 0,
    downloadThroughputKbps: 0,
    uploadThroughputKbps: 0,
  },
};
const MOBILE_SETTINGS = { formFactor: "mobile" };
const EXPECTED_404_SKIP_AUDITS = ["errors-in-console"];

function median(values) { return [...values].sort((left, right) => left - right)[Math.floor(values.length / 2)]; }

async function accessToken() {
  const state = JSON.parse(await readFile(AUTH_FILE, "utf8"));
  const [cookie] = state.cookies;
  if (state.origins.length !== 0 || state.cookies.length !== 1 || cookie?.name !== "access_token") throw new Error("invalid auth storage state");
  return cookie.value;
}

function cookieHeader(token) { return `access_token=${token}`; }

function headersFor(route, cookie) {
  return route.kind === "authenticated" ? { Cookie: cookie } : undefined;
}

async function probeRoute(route, cookie) {
  const response = await fetch(`${BASE_URL}${route.path}`, {
    headers: headersFor(route, cookie),
    redirect: "manual",
  });
  return { status: response.status, location: response.headers.get("location") };
}

async function cdpCommand(port, method, params) {
  const targetList = await fetch(`http://localhost:${port}/json/list`);
  if (!targetList.ok) throw new Error(`Chrome CDP target list returned ${targetList.status}`);
  const targets = await targetList.json();
  const target = targets.find((entry) => entry.type === "page" && typeof entry.webSocketDebuggerUrl === "string");
  if (!target) throw new Error("Chrome CDP page target missing");
  const { webSocketDebuggerUrl } = target;
  const socket = new WebSocket(webSocketDebuggerUrl);
  await new Promise((resolveOpen, rejectOpen) => {
    socket.addEventListener("open", resolveOpen, { once: true });
    socket.addEventListener("error", rejectOpen, { once: true });
  });
  try {
    const id = 1;
    const response = new Promise((resolveMessage, rejectMessage) => {
      socket.addEventListener("message", (event) => {
        const payload = JSON.parse(String(event.data));
        if (payload.id !== id) return;
        if (payload.error) rejectMessage(new Error(payload.error.message));
        else resolveMessage(payload.result);
      });
      socket.addEventListener("error", rejectMessage, { once: true });
    });
    socket.send(JSON.stringify({ id, method, params }));
    return await response;
  } finally {
    socket.close();
  }
}

async function installAuthCookie(chrome, token) {
  const result = await cdpCommand(chrome.port, "Network.setCookie", {
    name: "access_token",
    value: token,
    domain: "localhost",
    path: "/",
    httpOnly: true,
    secure: false,
    sameSite: "Lax",
  });
  if (result?.success !== true) throw new Error("failed to install auth cookie in Chrome profile");
}

async function auditRoute(chrome, route, formFactor, cookie) {
  const settings = {
    ...(formFactor === "mobile" ? MOBILE_SETTINGS : DESKTOP_SETTINGS),
    ignoreStatusCode: route.kind === "not-found",
    skipAudits: route.kind === "not-found" ? EXPECTED_404_SKIP_AUDITS : undefined,
  };
  const result = await lighthouse(`${BASE_URL}${route.path}`, {
    port: chrome.port, output: "json", onlyCategories: ["performance", "accessibility", "best-practices", "seo"], disableStorageReset: true,
    extraHeaders: headersFor(route, cookie),
  }, { extends: "lighthouse:default", settings });
  if (!result?.lhr) throw new Error("lighthouse returned no result");
  return {
    finalUrl: result.lhr.finalDisplayedUrl,
    responseCode: result.lhr.responseCode,
    scores: Object.fromEntries(Object.entries(result.lhr.categories).map(([name, category]) => [name, Math.round(category.score * 100)])),
  };
}

function thresholdFor(route, category) {
  if (category === "performance") {
    if (route.kind === "authenticated") return 90;
    if (route.kind === "public") return 95;
    return null;
  }
  if (category === "seo" && route.kind !== "public") return null;
  return 100;
}

function failuresFor(summary) {
  return summary.flatMap((entry) => Object.keys(CATEGORY_LABELS).flatMap((category) => {
    const minimum = thresholdFor(entry, category);
    const actual = entry.scores[category];
    if (minimum === null || actual >= minimum) return [];
    return [{ route: entry.route, kind: entry.kind, formFactor: entry.formFactor, category, actual, minimum }];
  }));
}

function expectedStatus(route) {
  return route.kind === "not-found" ? 404 : 200;
}

function routeFailuresFor(summary) {
  return summary.flatMap((entry) => {
    if (entry.probe.status === expectedStatus(entry) && entry.probe.location === null) return [];
    return [{ route: entry.route, kind: entry.kind, expectedStatus: expectedStatus(entry), actualStatus: entry.probe.status, location: entry.probe.location }];
  });
}

async function main() {
  await execFileAsync("npm", ["run", "qa:service-preflight"]);
  await execFileAsync("npm", ["run", "qa:auth-bootstrap"]);
  const token = await accessToken();
  const cookie = cookieHeader(token);
  const evidenceDir = resolve(process.cwd(), EVIDENCE_DIR);
  await mkdir(evidenceDir, { recursive: true });
  const chrome = await launch({ chromeFlags: ["--headless=new"] });
  try {
    await installAuthCookie(chrome, token);
    const summary = [];
    for (const route of AUDIT_ROUTES) for (const formFactor of ["mobile", "desktop"]) {
      const probe = await probeRoute(route, cookie);
      const runs = [];
      for (let index = 0; index < RUNS; index += 1) runs.push(await auditRoute(chrome, route, formFactor, cookie));
      const [firstRun] = runs;
      if (!firstRun) throw new Error("lighthouse produced no runs");
      summary.push({
        route: route.path,
        kind: route.kind,
        formFactor,
        probe,
        finalUrl: firstRun.finalUrl,
        responseCode: firstRun.responseCode,
        scores: Object.fromEntries(Object.keys(firstRun.scores).map((category) => [category, median(runs.map((run) => run.scores[category]))])),
      });
    }
    const failures = failuresFor(summary);
    const routeFailures = routeFailuresFor(summary);
    await writeFile(resolve(evidenceDir, "lighthouse-summary.json"), JSON.stringify({ runs: RUNS, summary, failures, routeFailures }, null, 2) + "\n", { mode: 0o600 });
    if (failures.length > 0) {
      process.stderr.write(`Lighthouse thresholds failed: ${failures.length} category result(s) below plan target\n`);
      process.exitCode = 1;
    }
    if (routeFailures.length > 0) {
      process.stderr.write(`Lighthouse route probes failed: ${routeFailures.length} route(s) did not match expected status\n`);
      process.exitCode = 1;
    }
  } finally { chrome.kill(); }
}

void main();
