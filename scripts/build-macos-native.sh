#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
BUILD_DIR="$ROOT_DIR/build/macos-native"
APP_DIR="$BUILD_DIR/Inkwell.app"
CONTENTS_DIR="$APP_DIR/Contents"
MACOS_DIR="$CONTENTS_DIR/MacOS"
CC_BIN="${CC:-clang}"

if [[ "$(uname -s)" != "Darwin" ]]; then
  printf 'macOS native shell must be built on macOS.\n' >&2
  exit 1
fi

mkdir -p "$MACOS_DIR"
cp "$ROOT_DIR/packaging/macos/Info.plist" "$CONTENTS_DIR/Info.plist"
printf 'APPL????' > "$CONTENTS_DIR/PkgInfo"

"$CC_BIN" \
  -std=c99 \
  -Wall \
  -Wextra \
  -Werror \
  -I"$ROOT_DIR/core/include" \
  "$ROOT_DIR/core/src/inkwell_core.c" \
  "$ROOT_DIR/shells/macos-appkit/main.m" \
  -framework AppKit \
  -o "$MACOS_DIR/Inkwell"

printf '%s\n' "$APP_DIR"
