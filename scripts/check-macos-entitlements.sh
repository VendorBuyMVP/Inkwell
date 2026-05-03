#!/usr/bin/env bash
set -euo pipefail

APP_PATH="${1:-}"
if [[ -z "$APP_PATH" ]]; then
  printf 'usage: %s /path/to/Inkwell.app\n' "$0" >&2
  exit 2
fi

TEMP_PLIST="$(mktemp "${TMPDIR:-/tmp}/inkwell-entitlements.XXXXXX.plist")"
trap 'rm -f "$TEMP_PLIST"' EXIT

codesign -d --xml --entitlements - "$APP_PATH" > "$TEMP_PLIST"

/usr/libexec/PlistBuddy -c "Print :com.apple.security.app-sandbox" "$TEMP_PLIST" | grep -qx true
/usr/libexec/PlistBuddy -c "Print :com.apple.security.files.user-selected.read-write" "$TEMP_PLIST" | grep -qx true

if /usr/libexec/PlistBuddy -c "Print :com.apple.security.network.client" "$TEMP_PLIST" >/dev/null 2>&1; then
  printf 'network client entitlement must not be present\n' >&2
  exit 1
fi

if /usr/libexec/PlistBuddy -c "Print :com.apple.security.network.server" "$TEMP_PLIST" >/dev/null 2>&1; then
  printf 'network server entitlement must not be present\n' >&2
  exit 1
fi

printf 'macOS entitlement check passed\n'
