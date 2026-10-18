#!/usr/bin/env node
// Verify that a running `next start` can actually serve its own build.
//
// A 200 on `GET /` proves nothing: the HTML is rendered by the process, while
// every stylesheet and script it references is read from disk. Rebuilding the
// dist directory under a live process produces exactly one symptom — the page
// loads with no CSS and no hydration, and every /_next/static request 500s —
// while `GET /` keeps answering 200. This script probes the assets themselves.
//
// Usage:
//   node scripts/verify-assets.mjs [--base http://localhost:31000]
//                                  [--route /login]
//                                  [--dist .next]

import fs from "node:fs";
import path from "node:path";

const args = process.argv.slice(2);
function arg(name, fallback) {
  const i = args.indexOf(name);
  return i === -1 ? fallback : args[i + 1];
}

const BASE = arg("--base", "http://localhost:31000").replace(/\/$/, "");
const ROUTE = arg("--route", "/login");
const DIST = path.resolve(arg("--dist", ".next"));

const failures = [];

function fail(message) {
  failures.push(message);
}

// The build id on disk. A process serving a different one is serving a build
// that no longer exists.
let diskBuildId = null;
try {
  diskBuildId = fs.readFileSync(path.join(DIST, "BUILD_ID"), "utf8").trim();
} catch {
  fail(`${DIST}/BUILD_ID is missing — the dist directory holds no build`);
}

const response = await fetch(`${BASE}${ROUTE}`, { redirect: "manual" });
if (response.status >= 500) {
  fail(`GET ${ROUTE} answered ${response.status}`);
}
const html = await response.text();

// Every asset the served document asks the browser to load. Chunk paths are
// also embedded inside inline flight/script payloads, not only in href/src
// attributes, so the whole document is scanned.
const referenced = new Set();
for (const match of html.matchAll(/\/_next\/static\/[^"'\\\s),]+/g)) {
  referenced.add(match[0]);
}

if (referenced.size === 0) {
  fail(`GET ${ROUTE} returned HTML referencing no /_next/ assets`);
}

const servedBuildId = html.match(/\/_next\/static\/([A-Za-z0-9_-]{16,})\/_buildManifest\.js/)?.[1];
if (diskBuildId && servedBuildId && servedBuildId !== diskBuildId) {
  fail(
    `served HTML carries build ${servedBuildId}, disk holds ${diskBuildId} — the running process predates the build`,
  );
}

// The client fetches build-manifest.json at runtime and then requests the chunk
// files it lists. Those paths never appear in the HTML, so the manifest is
// walked too — it is the list of files the browser is about to ask for.
try {
  const manifest = JSON.parse(
    fs.readFileSync(path.join(DIST, "build-manifest.json"), "utf8"),
  );
  for (const key of ["polyfillFiles", "rootMainFiles"]) {
    for (const entry of manifest[key] ?? []) {
      referenced.add(`/_next/${entry}`);
    }
  }
} catch {
  fail(`${DIST}/build-manifest.json is missing or unreadable`);
}

for (const asset of [...referenced].sort()) {
  const onDisk = path.join(DIST, asset.replace(/^\/_next\//, ""));
  if (!fs.existsSync(onDisk)) {
    fail(`${asset} is referenced by the HTML but absent from ${DIST}`);
    continue;
  }
  const assetResponse = await fetch(`${BASE}${asset}`, { redirect: "manual" });
  if (assetResponse.status !== 200) {
    fail(`${asset} answered ${assetResponse.status}`);
  }
}

if (failures.length > 0) {
  console.error(`verify-assets: ${failures.length} failure(s) at ${BASE}${ROUTE}`);
  for (const failure of failures) console.error(`  - ${failure}`);
  process.exit(1);
}

console.log(
  `verify-assets: ${referenced.size} assets referenced by ${ROUTE} all served 200 (build ${diskBuildId ?? "unknown"})`,
);
