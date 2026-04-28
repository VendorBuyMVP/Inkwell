#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
BUILD_DIR="$ROOT_DIR/build/linux-native"
CC_BIN="${CC:-cc}"

if ! pkg-config --exists gtk+-3.0; then
  printf 'GTK3 development files are required for the native Linux shell.\n' >&2
  exit 1
fi

mkdir -p "$BUILD_DIR"

"$CC_BIN" \
  -std=c99 \
  -Wall \
  -Wextra \
  -Werror \
  -I"$ROOT_DIR/core/include" \
  "$ROOT_DIR/core/src/inkwell_core.c" \
  "$ROOT_DIR/shells/linux-gtk-native/main.c" \
  $(pkg-config --cflags --libs gtk+-3.0) \
  -o "$BUILD_DIR/inkwell-native"

printf '%s\n' "$BUILD_DIR/inkwell-native"
