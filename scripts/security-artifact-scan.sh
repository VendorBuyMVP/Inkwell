#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

if [[ "$#" -gt 0 ]]; then
  targets=("$@")
else
  targets=("$ROOT_DIR/build/linux-native" "$ROOT_DIR/build/macos-native" "$ROOT_DIR/build/windows-native")
fi

found=0
match_file="$(mktemp)"

cleanup() {
  rm -f "$match_file"
}
trap cleanup EXIT

for target in "${targets[@]}"; do
  if [[ ! -e "$target" ]]; then
    continue
  fi

  while IFS= read -r -d '' file; do
    if strings -a "$file" | rg -i 'https?://[A-Za-z0-9]|wss?://|telemetry|analytics|sentry|crash(upload|report|pad|lytics)?|updater|update ping|tracking|beacon|remote logging|cloud sync' > "$match_file"; then
      printf 'Artifact security scan failed: %s\n' "$file" >&2
      cat "$match_file" >&2
      found=1
    fi
  done < <(find "$target" -type f -print0)
done

if [[ "$found" -ne 0 ]]; then
  exit 1
fi

printf 'security artifact scan passed\n'
