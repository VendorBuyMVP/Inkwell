#!/usr/bin/env node
import assert from "node:assert/strict";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";

const runtimeFiles = [
  "app/inkwell.py",
  "app/frontend/index.html",
  "app/frontend/app.js",
  "app/frontend/markdown.js",
  "app/frontend/styles.css",
  "scripts/run-linux.sh",
  "scripts/install-linux-desktop-entry.sh",
  "scripts/install-linux-native-desktop-entry.sh",
  "scripts/build-core.sh",
  "scripts/build-linux-native.sh",
  "scripts/build-macos-native.sh",
  "scripts/build-windows-native.ps1",
  "packaging/linux/inkwell.desktop",
  ".github/workflows/native-build.yml",
  "package.json",
];

for (const path of ["core/include", "core/src", "shells"]) {
  try {
    runtimeFiles.push(
      ...collectFiles(path).filter((file) => /\.(c|h|m|mm|swift|cpp|hpp|rc|xml|desktop|sh|ps1)$/.test(file)),
    );
  } catch (_error) {
    // Optional platform directories may not exist in early checkouts.
  }
}

for (const path of ["packaging"]) {
  runtimeFiles.push(
    ...collectFiles(path).filter((file) => /\.(desktop|plist|manifest|rc)$/.test(file)),
  );
}

const bannedPatterns = [
  [/\bfetch\s*\(/, "fetch"],
  [/\bXMLHttpRequest\b/, "XMLHttpRequest"],
  [/\bnavigator\.sendBeacon\b|\bsendBeacon\b/, "sendBeacon"],
  [/\bEventSource\b/, "EventSource"],
  [/\bWebSocket\b/, "WebSocket"],
  [/\blocalStorage\b/, "localStorage"],
  [/\bsessionStorage\b/, "sessionStorage"],
  [/\binnerHTML\b/, "innerHTML"],
  [/\binsertAdjacentHTML\b/, "insertAdjacentHTML"],
  [/\beval\s*\(/, "eval"],
  [/\bnew Function\b/, "new Function"],
  [/\bcrashReporter\b|\bautoUpdater\b/, "Electron crash/update APIs"],
  [/\bsentry\b/i, "Sentry"],
  [/\btelemetry\b/i, "telemetry"],
  [/\banalytics\b/i, "analytics"],
  [/\btracking pixel\b/i, "tracking pixel"],
  [/\brequests\b|\burllib\.request\b/, "Python HTTP client"],
  [/\bsocket\b/, "socket API"],
  [/\bsubprocess\b|\bPopen\b|\bos\.system\b/, "process spawning"],
  [/\bopenExternal\b/, "external URL opener"],
  [/\bws:\/\/|\bwss:\/\//, "WebSocket URL"],
];

const allowedUrlFragments = new Map([
  ["app/inkwell.py", ["http://127.0.0.1:9"]],
  ["core/src/inkwell_core.c", ["http://", "https://"]],
]);

const allowedTextFragments = new Map([
  ["package.json", ["no telemetry"]],
]);

function collectFiles(path) {
  const stat = statSync(path);
  if (stat.isDirectory()) {
    return readdirSync(path).flatMap((entry) => collectFiles(join(path, entry)));
  }
  return [path];
}

for (const file of runtimeFiles) {
  const normalizedFile = file.replaceAll("\\", "/");
  const source = readFileSync(file, "utf8");
  const textScrubbed = (allowedTextFragments.get(normalizedFile) || []).reduce(
    (text, fragment) => text.replaceAll(fragment, ""),
    source,
  );

  for (const [pattern, label] of bannedPatterns) {
    assert.doesNotMatch(textScrubbed, pattern, `${normalizedFile} must not contain ${label}`);
  }

  const allowed = allowedUrlFragments.get(normalizedFile) || [];
  const scrubbed = allowed.reduce((text, fragment) => text.replaceAll(fragment, ""), source);
  assert.doesNotMatch(scrubbed, /\bhttps?:\/\//, `${normalizedFile} must not contain remote URLs`);
}

for (const file of collectFiles("app/assets")) {
  const source = readFileSync(file).toString("latin1");
  assert.doesNotMatch(
    source,
    /\bhttps?:\/\/|\btelemetry\b|\banalytics\b|\bsentry\b|\bcrash\b|\btracking\b|\bbeacon\b|\bupload\b/i,
    `${file} must not contain remote URL or telemetry metadata`,
  );
}

console.log("security source scan passed");
