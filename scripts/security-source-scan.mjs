#!/usr/bin/env node
import assert from "node:assert/strict";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";

const runtimeFiles = [
  "app/inkwell.py",
  "app/frontend/index.html",
  "app/frontend/editor-engine.js",
  "app/frontend/app.js",
  "app/frontend/markdown.js",
  "app/frontend/styles.css",
  "platforms/macos/Inkwell/main.swift",
  "platforms/macos/Inkwell/AppDelegate.swift",
  "platforms/macos/Inkwell/AppRuntimeOptions.swift",
  "platforms/macos/Inkwell/BridgeJSON.swift",
  "platforms/macos/Inkwell/DocumentAccess.swift",
  "platforms/macos/Inkwell/InkwellBridge.swift",
  "platforms/macos/Inkwell/InkwellError.swift",
  "platforms/macos/Inkwell/InkwellWindowController.swift",
  "platforms/macos/Inkwell/PreferencesStore.swift",
  "scripts/run-linux.sh",
  "scripts/install-linux-desktop-entry.sh",
  "scripts/build-macos-local.sh",
  "scripts/build-frontend.mjs",
  "scripts/check-macos-entitlements.sh",
  "scripts/smoke-macos-local.sh",
  "scripts/build-flatpak-local.sh",
  "scripts/validate-flatpak-posture.sh",
  "packaging/flatpak/io.github.VendorBuyMVP.Inkwell.yml",
  "packaging/linux/io.github.VendorBuyMVP.Inkwell.desktop",
  ".github/workflows/linux-webkit-build.yml",
  "package.json",
];

for (const path of ["packaging"]) {
  runtimeFiles.push(
    ...collectFiles(path).filter((file) => /\.desktop$/.test(file)),
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
  [/\bimport\s+requests\b|\bfrom\s+requests\b|\burllib\.request\b/, "Python HTTP client"],
  [/\bsocket\b/, "socket API"],
  [/\bsubprocess\b|\bPopen\b|\bos\.system\b/, "process spawning"],
  [/\bopenExternal\b/, "external URL opener"],
  [/\bws:\/\/|\bwss:\/\//, "WebSocket URL"],
];

const allowedUrlFragments = new Map([
  ["app/inkwell.py", ["http://127.0.0.1:9"]],
  ["scripts/build-flatpak-local.sh", ["https://dl.flathub.org/media"]],
]);

const allowedTextFragments = new Map([
  ["package.json", ["no telemetry"]],
  ["packaging/flatpak/io.github.VendorBuyMVP.Inkwell.yml", ["--socket=wayland", "--socket=fallback-x11"]],
  ["scripts/validate-flatpak-posture.sh", ["--socket=wayland", "Wayland socket", "--socket=fallback-x11", "--socket=x11"]],
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
