#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
APP_ID="io.github.VendorBuyMVP.Inkwell"
BIN_DIR="$HOME/.local/bin"
APP_DIR="$HOME/.local/share/applications"
ICON_ROOT="$HOME/.local/share/icons/hicolor"

mkdir -p "$BIN_DIR" "$APP_DIR"

launcher="$BIN_DIR/inkwell"
target="$ROOT_DIR/scripts/run-linux.sh"

if [[ -e "$launcher" || -L "$launcher" ]]; then
  current_target="$(readlink "$launcher" || true)"
  if [[ ! -L "$launcher" || ( "$current_target" != "$target" && "$current_target" != "$ROOT_DIR/"* ) ]]; then
    printf 'Refusing to overwrite existing launcher: %s\n' "$launcher" >&2
    exit 1
  fi
fi

ln -sfn "$target" "$launcher"
rm -f "$APP_DIR/inkwell-native.desktop"
rm -f "$APP_DIR/inkwell.desktop"

for size in 64 128 256 512; do
  icon_dir="$ICON_ROOT/${size}x${size}/apps"
  mkdir -p "$icon_dir"
  cp "$ROOT_DIR/app/assets/icons/inkwell-${size}.png" "$icon_dir/inkwell.png"
  cp "$ROOT_DIR/app/assets/icons/inkwell-${size}.png" "$icon_dir/${APP_ID}.png"
done

desktop_file="$APP_DIR/${APP_ID}.desktop"
{
  printf '%s\n' '[Desktop Entry]'
  printf '%s\n' 'Type=Application'
  printf '%s\n' 'Name=Inkwell'
  printf '%s\n' 'Comment=Local-first Markdown editor'
  printf 'Exec=%s %%F\n' "$BIN_DIR/inkwell"
  printf 'Icon=%s\n' "$APP_ID"
  printf 'Path=%s\n' "$ROOT_DIR"
  printf '%s\n' 'Terminal=false'
  printf '%s\n' 'Categories=Utility;TextEditor;'
  printf '%s\n' 'MimeType=text/markdown;text/x-markdown;application/x-markdown;'
  printf '%s\n' 'StartupNotify=true'
  printf 'StartupWMClass=%s\n' "$APP_ID"
} > "$desktop_file"

if command -v gsettings >/dev/null 2>&1; then
  current_favorites="$(gsettings get org.gnome.shell favorite-apps 2>/dev/null || true)"
  if [[ "$current_favorites" == *"'inkwell.desktop'"* ]]; then
    UPDATED_FAVORITES="$(CURRENT_FAVORITES="$current_favorites" APP_ID="$APP_ID" python3 - <<'PY'
import ast
import os

favorites = ast.literal_eval(os.environ["CURRENT_FAVORITES"])
app_id = os.environ["APP_ID"] + ".desktop"
updated = []
for favorite in favorites:
    if favorite == "inkwell.desktop":
        if app_id not in updated:
            updated.append(app_id)
    elif favorite not in updated:
        updated.append(favorite)
print(repr(updated))
PY
)"
    gsettings set org.gnome.shell favorite-apps "$UPDATED_FAVORITES" >/dev/null 2>&1 || true
  fi
fi

if command -v gtk-update-icon-cache >/dev/null 2>&1; then
  gtk-update-icon-cache -f -t "$ICON_ROOT" >/dev/null 2>&1 || true
fi

if command -v update-desktop-database >/dev/null 2>&1; then
  update-desktop-database "$APP_DIR" >/dev/null 2>&1 || true
fi

printf 'Installed %s\n' "$desktop_file"
printf 'Installed icons under %s\n' "$ICON_ROOT"
