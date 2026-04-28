#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
BUILD_DIR="${ROOT_DIR}/build/core"
CC_BIN="${CC:-cc}"

mkdir -p "$BUILD_DIR"

"$CC_BIN" \
  -std=c99 \
  -Wall \
  -Wextra \
  -Werror \
  -pedantic \
  -I"$ROOT_DIR/core/include" \
  "$ROOT_DIR/core/src/inkwell_core.c" \
  "$ROOT_DIR/core/tests/core_test.c" \
  -o "$BUILD_DIR/inkwell-core-test"

"$BUILD_DIR/inkwell-core-test"
