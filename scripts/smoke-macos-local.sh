#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
APP_PATH="$ROOT_DIR/build/macos-local/Inkwell.app"
SAMPLE_DIR="$(mktemp -d "${TMPDIR:-/tmp}/inkwell-macos-smoke.XXXXXX")"
SAMPLE_FILE="$SAMPLE_DIR/sample.md"

cleanup() {
  osascript -e 'tell application id "io.github.VendorBuyMVP.Inkwell" to quit' >/dev/null 2>&1 || true
  rm -rf "$SAMPLE_DIR"
}
trap cleanup EXIT

cat > "$SAMPLE_FILE" <<'MARKDOWN'
# Inkwell macOS smoke test

This file verifies open-with launch plumbing for the local macOS app bundle.
MARKDOWN

npm run macos:build

test -x "$APP_PATH/Contents/MacOS/Inkwell"
test -f "$APP_PATH/Contents/Resources/frontend/index.html"
test -f "$APP_PATH/Contents/Resources/frontend/app.js"
test -f "$APP_PATH/Contents/Resources/frontend/markdown.js"
test -f "$APP_PATH/Contents/Resources/frontend/styles.css"
test -f "$APP_PATH/Contents/Resources/Inkwell.icns"

plutil -extract CFBundleIdentifier raw -o - "$APP_PATH/Contents/Info.plist" | grep -qx 'io.github.VendorBuyMVP.Inkwell'
plutil -extract CFBundleShortVersionString raw -o - "$APP_PATH/Contents/Info.plist" | grep -qx "$(node -p "require('./package.json').version")"

DIAGNOSTICS_FILE="$SAMPLE_DIR/diagnostics.json"
"$APP_PATH/Contents/MacOS/Inkwell" --diagnostics "$DIAGNOSTICS_FILE" "$SAMPLE_FILE" > "$SAMPLE_DIR/diagnostics.stdout" 2> "$SAMPLE_DIR/diagnostics.stderr" &
DIAGNOSTICS_PID=$!
for _ in {1..30}; do
  if [[ -s "$DIAGNOSTICS_FILE" ]]; then
    break
  fi
  if ! kill -0 "$DIAGNOSTICS_PID" >/dev/null 2>&1; then
    break
  fi
  sleep 0.5
done
kill "$DIAGNOSTICS_PID" >/dev/null 2>&1 || true

node - "$DIAGNOSTICS_FILE" <<'NODE'
const fs = require("node:fs");
const path = process.argv[2];
const diagnostics = JSON.parse(fs.readFileSync(path, "utf8"));
const required = {
  shellExists: true,
  editorExists: true,
  markdownExists: true,
  invokeCommandExists: true,
  bridgeResponseExists: true,
};

for (const [key, expected] of Object.entries(required)) {
  if (diagnostics[key] !== expected) {
    throw new Error(`Expected ${key} to be ${expected}, got ${diagnostics[key]}`);
  }
}

if (diagnostics.readyState !== "complete") {
  throw new Error(`Expected readyState complete, got ${diagnostics.readyState}`);
}
if (diagnostics.nativeWebViewWidth <= 0 || diagnostics.nativeWebViewHeight <= 0) {
  throw new Error("WKWebView has no visible size.");
}
if (diagnostics.saveMenuShortcut !== "Command+S") {
  throw new Error(`Expected macOS Save menu shortcut to be Command+S, got ${diagnostics.saveMenuShortcut}`);
}
if (!["dark", "light"].includes(diagnostics.bodyTheme)) {
  throw new Error(`Expected body theme to follow a system theme, got ${diagnostics.bodyTheme}`);
}
if (Array.isArray(diagnostics.diagnosticErrors) && diagnostics.diagnosticErrors.length) {
  throw new Error(`Frontend diagnostics reported errors: ${JSON.stringify(diagnostics.diagnosticErrors)}`);
}
NODE

open -n -a "$APP_PATH" --args "$SAMPLE_FILE"
sleep 3

pgrep -f "$APP_PATH/Contents/MacOS/Inkwell" >/dev/null

swift -e 'import CoreGraphics; let windows = CGWindowListCopyWindowInfo(CGWindowListOption(arrayLiteral: .optionOnScreenOnly), kCGNullWindowID) as? [[String: Any]] ?? []; let visible = windows.contains { ($0[kCGWindowOwnerName as String] as? String) == "Inkwell" && ($0[kCGWindowLayer as String] as? Int) == 0 }; if !visible { fatalError("No onscreen Inkwell window found.") }'

osascript -e 'tell application id "io.github.VendorBuyMVP.Inkwell" to quit' >/dev/null 2>&1 || true
sleep 1

if pgrep -f "$APP_PATH/Contents/MacOS/Inkwell" >/dev/null; then
  printf 'Inkwell process did not exit after quit request.\n' >&2
  exit 1
fi

printf 'macOS local smoke check passed\n'
