#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
BIN_DIR="$HOME/.local/bin"
APP_DIR="$HOME/.local/share/applications"
ICON_ROOT="$HOME/.local/share/icons/hicolor"
BUILD_OUTPUT="$("$ROOT_DIR/scripts/build-linux-native.sh")"

mkdir -p "$BIN_DIR" "$APP_DIR"

launcher="$BIN_DIR/inkwell-native"
target="$BUILD_OUTPUT"

if [[ -e "$launcher" || -L "$launcher" ]]; then
  if [[ ! -L "$launcher" || "$(readlink "$launcher")" != "$target" ]]; then
    printf 'Refusing to overwrite existing launcher: %s\n' "$launcher" >&2
    exit 1
  fi
fi

ln -sfn "$target" "$launcher"

for size in 64 128 256 512; do
  icon_dir="$ICON_ROOT/${size}x${size}/apps"
  mkdir -p "$icon_dir"
  cp "$ROOT_DIR/app/assets/icons/inkwell-${size}.png" "$icon_dir/inkwell.png"
done

desktop_file="$APP_DIR/inkwell-native.desktop"
{
  printf '%s\n' '[Desktop Entry]'
  printf '%s\n' 'Type=Application'
  printf '%s\n' 'Name=Inkwell Native'
  printf '%s\n' 'Comment=Private local Markdown editor'
  printf 'Exec=%s %%F\n' "$launcher"
  printf '%s\n' 'Icon=inkwell'
  printf 'Path=%s\n' "$ROOT_DIR"
  printf '%s\n' 'Terminal=false'
  printf '%s\n' 'Categories=Utility;TextEditor;'
  printf '%s\n' 'MimeType=text/markdown;text/x-markdown;application/x-markdown;'
  printf '%s\n' 'StartupNotify=true'
} > "$desktop_file"

if command -v gtk-update-icon-cache >/dev/null 2>&1; then
  gtk-update-icon-cache -f -t "$ICON_ROOT" >/dev/null 2>&1 || true
fi

if command -v update-desktop-database >/dev/null 2>&1; then
  update-desktop-database "$APP_DIR" >/dev/null 2>&1 || true
fi

printf 'Installed %s\n' "$desktop_file"
printf 'Installed %s\n' "$launcher"
