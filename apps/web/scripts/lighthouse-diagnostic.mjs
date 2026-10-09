import { execFile } from "node:child_process";
import { readFile, writeFile } from "node:fs/promises";
import { promisify } from "node:util";
import { launch } from "chrome-launcher";
import lighthouse from "lighthouse";

const execFileAsync = promisify(execFile);
const BASE_URL = "http://localhost:28801";
const AUTH_FILE = "e2e/.auth/storageState.json";
const ROUTE = process.argv[2] || "/";
const FORM_FACTOR = process.argv[3] || "mobile";

const DESKTOP_SETTINGS = {
  formFactor: "desktop",
  screenEmulation: { mobile: false, width: 1350, height: 940, deviceScaleFactor: 1, disabled: false },
  throttling: {
    rttMs: 40, throughputKbps: 10240, cpuSlowdownMultiplier: 1,
    requestLatencyMs: 0, downloadThroughputKbps: 0, uploadThroughputKbps: 0,
  },
};
const MOBILE_SETTINGS = { formFactor: "mobile" };

async function accessToken() {
  const state = JSON.parse(await readFile(AUTH_FILE, "utf8"));
  const [cookie] = state.cookies;
  return cookie.value;
}

async function cdpCommand(port, method, params) {
  const targetList = await fetch(`http://localhost:${port}/json/list`);
  const targets = await targetList.json();
  const target = targets.find((e) => e.type === "page" && typeof e.webSocketDebuggerUrl === "string");
  const { webSocketDebuggerUrl } = target;
  const socket = new WebSocket(webSocketDebuggerUrl);
  await new Promise((res, rej) => { socket.addEventListener("open", res, { once: true }); socket.addEventListener("error", rej, { once: true }); });
  try {
    const id = 1;
    const response = new Promise((res, rej) => {
      socket.addEventListener("message", (event) => { const p = JSON.parse(String(event.data)); if (p.id !== id) return; if (p.error) rej(new Error(p.error.message)); else res(p.result); });
      socket.addEventListener("error", rej, { once: true });
    });
    socket.send(JSON.stringify({ id, method, params }));
    return await response;
  } finally { socket.close(); }
}

async function main() {
  await execFileAsync("npm", ["run", "qa:auth-bootstrap"]);
  const token = await accessToken();
  const chrome = await launch({ chromeFlags: ["--headless=new"] });
  try {
    await cdpCommand(chrome.port, "Network.setCookie", {
      name: "access_token", value: token, domain: "localhost", path: "/",
      httpOnly: true, secure: false, sameSite: "Lax",
    });
    const settings = FORM_FACTOR === "mobile" ? MOBILE_SETTINGS : DESKTOP_SETTINGS;
    const result = await lighthouse(`${BASE_URL}${ROUTE}`, {
      port: chrome.port, output: "json",
      onlyCategories: ["performance", "accessibility", "best-practices", "seo"],
      disableStorageReset: true,
      extraHeaders: { Cookie: `access_token=${token}` },
    }, { extends: "lighthouse:default", settings });

    const lhr = result.lhr;
    
    // Extract key performance metrics
    const audits = lhr.audits;
    const perf = {
      scores: Object.fromEntries(Object.entries(lhr.categories).map(([n, c]) => [n, Math.round(c.score * 100)])),
      metrics: {
        'first-contentful-paint': audits['first-contentful-paint']?.numericValue,
        'largest-contentful-paint': audits['largest-contentful-paint']?.numericValue,
        'total-blocking-time': audits['total-blocking-time']?.numericValue,
        'cumulative-layout-shift': audits['cumulative-layout-shift']?.numericValue,
        'speed-index': audits['speed-index']?.numericValue,
        'interactive': audits['interactive']?.numericValue,
        'mainthread-work-breakdown': audits['mainthread-work-breakdown']?.details?.items?.slice(0, 10),
        'bootup-time': audits['bootup-time']?.details?.items?.slice(0, 10),
        'long-tasks': audits['long-tasks']?.details?.items?.slice(0, 10),
        'unused-javascript': audits['unused-javascript']?.details?.items?.slice(0, 15),
        'unused-css-rules': audits['unused-css-rules']?.details?.items?.slice(0, 10),
        'render-blocking-resources': audits['render-blocking-resources']?.details?.items?.slice(0, 10),
        'unminified-javascript': audits['unminified-javascript']?.details?.items?.slice(0, 10),
        'total-byte-weight': audits['total-byte-weight']?.numericValue,
        'dom-size': audits['dom-size']?.numericValue,
        'dom-size-details': audits['dom-size']?.details?.items,
        'largest-contentful-paint-element': audits['largest-contentful-paint-element']?.details?.items,
        'layout-shifts': audits['layout-shifts']?.details?.items?.slice(0, 5),
        'network-rtt': audits['network-rtt']?.numericValue,
        'network-server-latency': audits['network-server-latency']?.numericValue,
        'third-party-summary': audits['third-party-summary']?.details?.items?.slice(0, 5),
        'resource-summary': audits['resource-summary']?.details?.items,
        'javascript-libraries': audits['javascript-libraries']?.details?.items,
      },
      // Also get the top-level performance opportunities
      opportunities: Object.entries(audits)
        .filter(([, a]) => a.details?.type === 'opportunity' && a.score !== null && a.score < 1)
        .map(([key, a]) => ({
          id: key,
          title: a.title,
          score: a.score,
          numericValue: a.numericValue,
          wastedMs: a.details?.overallSavingsMs,
          wastedBytes: a.details?.overallSavingsBytes,
          items: a.details?.items?.slice(0, 5),
        }))
        .sort((a, b) => (b.wastedMs || 0) - (a.wastedMs || 0))
        .slice(0, 15),
      // Diagnostics
      diagnostics: Object.entries(audits)
        .filter(([, a]) => a.details?.type === 'table' && a.score !== null && a.score < 0.5)
        .map(([key, a]) => ({
          id: key,
          title: a.title,
          score: a.score,
          displayValue: a.displayValue,
        }))
        .slice(0, 15),
    };
    
    await writeFile(`/tmp/lighthouse-diagnostic-${ROUTE.replace(/[/?=]/g, '_')}-${FORM_FACTOR}.json`, JSON.stringify(perf, null, 2));
    console.log(JSON.stringify(perf.scores));
    console.log('\n=== TOP OPPORTUNITIES ===');
    for (const opp of perf.opportunities) {
      console.log(`  ${opp.id}: score=${opp.score} wastedMs=${opp.wastedMs?.toFixed(0)}ms wastedBytes=${opp.wastedBytes?.toFixed(0)}`);
      console.log(`    ${opp.title}`);
    }
    console.log('\n=== KEY METRICS ===');
    console.log(`  FCP: ${perf.metrics['first-contentful-paint']?.toFixed(0)}ms`);
    console.log(`  LCP: ${perf.metrics['largest-contentful-paint']?.toFixed(0)}ms`);
    console.log(`  TBT: ${perf.metrics['total-blocking-time']?.toFixed(0)}ms`);
    console.log(`  CLS: ${perf.metrics['cumulative-layout-shift']?.toFixed(4)}`);
    console.log(`  TTI: ${perf.metrics['interactive']?.toFixed(0)}ms`);
    console.log(`  SI: ${perf.metrics['speed-index']?.toFixed(0)}`);
    console.log(`  Total bytes: ${perf.metrics['total-byte-weight']}`);
    console.log(`  DOM size: ${perf.metrics['dom-size']}`);
    console.log('\n=== RESOURCE SUMMARY ===');
    if (perf.metrics['resource-summary']) {
      for (const r of perf.metrics['resource-summary']) {
        console.log(`  ${r.resourceType}: ${r.requestCount} requests, ${(r.transferSize/1024).toFixed(1)}KB`);
      }
    }
    console.log('\n=== MAIN THREAD WORK ===');
    if (perf.metrics['mainthread-work-breakdown']) {
      for (const w of perf.metrics['mainthread-work-breakdown']) {
        console.log(`  ${w.group}: ${(w.duration/1000).toFixed(0)}ms`);
      }
    }
    console.log('\n=== LONG TASKS ===');
    if (perf.metrics['long-tasks']) {
      for (const t of perf.metrics['long-tasks']) {
        console.log(`  ${(t.duration).toFixed(0)}ms: ${t.url?.slice(0, 80) || 'unknown'}`);
      }
    }
    console.log('\n=== BOOTUP TIME ===');
    if (perf.metrics['bootup-time']) {
      for (const b of perf.metrics['bootup-time']) {
        console.log(`  ${(b.duration).toFixed(0)}ms: ${b.url?.slice(0, 100) || 'unknown'}`);
      }
    }
    console.log('\n=== UNUSED JS (top 15) ===');
    if (perf.metrics['unused-javascript']) {
      for (const u of perf.metrics['unused-javascript']) {
        console.log(`  ${(u.wastedBytes/1024).toFixed(1)}KB wasted: ${u.url?.slice(0, 100) || 'unknown'}`);
      }
    }
    console.log(`\nFull diagnostic saved to /tmp/lighthouse-diagnostic-${ROUTE.replace(/[/?=]/g, '_')}-${FORM_FACTOR}.json`);
  } finally { chrome.kill(); }
}

void main();
