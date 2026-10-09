#!/usr/bin/env node
/**
 * Scan JS/TS source files and report those exceeding a maximum line count.
 * Skips blank lines and comment-only lines.
 */
const fs = require("fs");
const path = require("path");

function countLoc(filePath) {
  const content = fs.readFileSync(filePath, "utf-8");
  let codeLines = 0;
  for (const line of content.split("\n")) {
    const trimmed = line.trim();
    if (trimmed && !trimmed.startsWith("//") && !trimmed.startsWith("/*") && !trimmed.startsWith("*")) {
      codeLines++;
    }
  }
  return codeLines;
}

function collectFiles(targets) {
  const files = [];
  for (const target of targets) {
    const stat = fs.statSync(target);
    if (stat.isFile()) {
      files.push(target);
    } else if (stat.isDirectory()) {
      walkDir(target, files);
    }
  }
  return files;
}

function walkDir(dir, files) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (entry.name !== "node_modules" && entry.name !== ".next") {
        walkDir(fullPath, files);
      }
    } else if (/\.(js|jsx|ts|tsx|mjs)$/.test(entry.name)) {
      files.push(fullPath);
    }
  }
}

function main() {
  const args = process.argv.slice(2);
  const maxLocIdx = args.indexOf("--max-loc");
  let maxLoc = 250;
  let paths = args;

  if (maxLocIdx !== -1) {
    maxLoc = parseInt(args[maxLocIdx + 1], 10);
    paths = args.filter((_, i) => i !== maxLocIdx && i !== maxLocIdx + 1);
  }

  if (paths.length === 0) {
    console.error("Usage: lint_file_size.js [--max-loc N] <path1> [path2 ...]");
    process.exit(1);
  }

  const files = collectFiles(paths);
  let exitCode = 0;

  for (const f of files.sort()) {
    const loc = countLoc(f);
    if (loc > maxLoc) {
      console.log(`FAIL ${f}  (${loc} LOC exceeds ${maxLoc})`);
      exitCode = 1;
    }
  }

  if (exitCode === 0) {
    console.log("All files within size limit.");
  }

  process.exit(exitCode);
}

main();
