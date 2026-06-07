#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
BUILD_DIR="$ROOT_DIR/build/macos-local"
APP_DIR="$BUILD_DIR/Inkwell.app"
CONTENTS_DIR="$APP_DIR/Contents"
MACOS_DIR="$CONTENTS_DIR/MacOS"
RESOURCES_DIR="$CONTENTS_DIR/Resources"
FRONTEND_DEST="$RESOURCES_DIR/frontend"
SOURCE_DIR="$ROOT_DIR/platforms/macos/Inkwell"
INFO_PLIST="$SOURCE_DIR/Info.plist"
ENTITLEMENTS="$SOURCE_DIR/Inkwell.entitlements"
ICON_SOURCE="$ROOT_DIR/app/assets/icons/inkwell-1024.png"
VERSION="$(node -p "require('./package.json').version")"
SANDBOX=0

while [[ $# -gt 0 ]]; do
  case "$1" in
    --sandbox)
      SANDBOX=1
      shift
      ;;
    *)
      printf 'unknown option: %s\n' "$1" >&2
      exit 2
      ;;
  esac
done

rm -rf "$APP_DIR"
mkdir -p "$MACOS_DIR" "$FRONTEND_DEST" "$RESOURCES_DIR"

swiftc \
  -framework AppKit \
  -framework WebKit \
  "$SOURCE_DIR/main.swift" \
  "$SOURCE_DIR/AppDelegate.swift" \
  "$SOURCE_DIR/AppRuntimeOptions.swift" \
  "$SOURCE_DIR/BridgeJSON.swift" \
  "$SOURCE_DIR/DocumentAccess.swift" \
  "$SOURCE_DIR/InkwellBridge.swift" \
  "$SOURCE_DIR/InkwellError.swift" \
  "$SOURCE_DIR/InkwellWindowController.swift" \
  "$SOURCE_DIR/PreferencesStore.swift" \
  -o "$MACOS_DIR/Inkwell"

cp "$INFO_PLIST" "$CONTENTS_DIR/Info.plist"
/usr/libexec/PlistBuddy -c "Set :CFBundleShortVersionString $VERSION" "$CONTENTS_DIR/Info.plist"
/usr/libexec/PlistBuddy -c "Set :CFBundleVersion $VERSION" "$CONTENTS_DIR/Info.plist"

cp "$ROOT_DIR/app/frontend/index.html" "$FRONTEND_DEST/index.html"
cp "$ROOT_DIR/app/frontend/app.js" "$FRONTEND_DEST/app.js"
cp "$ROOT_DIR/app/frontend/markdown.js" "$FRONTEND_DEST/markdown.js"
cp "$ROOT_DIR/app/frontend/styles.css" "$FRONTEND_DEST/styles.css"
mkdir -p "$FRONTEND_DEST/vendor/lucide"
cp "$ROOT_DIR/app/frontend/vendor/lucide/LICENSE" "$FRONTEND_DEST/vendor/lucide/LICENSE"

ICONSET="$BUILD_DIR/Inkwell.iconset"
rm -rf "$ICONSET"
mkdir -p "$ICONSET"
sips -z 16 16 "$ICON_SOURCE" --out "$ICONSET/icon_16x16.png" >/dev/null
sips -z 32 32 "$ICON_SOURCE" --out "$ICONSET/icon_16x16@2x.png" >/dev/null
sips -z 32 32 "$ICON_SOURCE" --out "$ICONSET/icon_32x32.png" >/dev/null
sips -z 64 64 "$ICON_SOURCE" --out "$ICONSET/icon_32x32@2x.png" >/dev/null
sips -z 128 128 "$ICON_SOURCE" --out "$ICONSET/icon_128x128.png" >/dev/null
sips -z 256 256 "$ICON_SOURCE" --out "$ICONSET/icon_128x128@2x.png" >/dev/null
sips -z 256 256 "$ICON_SOURCE" --out "$ICONSET/icon_256x256.png" >/dev/null
sips -z 512 512 "$ICON_SOURCE" --out "$ICONSET/icon_256x256@2x.png" >/dev/null
sips -z 512 512 "$ICON_SOURCE" --out "$ICONSET/icon_512x512.png" >/dev/null
sips -z 1024 1024 "$ICON_SOURCE" --out "$ICONSET/icon_512x512@2x.png" >/dev/null
iconutil -c icns "$ICONSET" -o "$RESOURCES_DIR/Inkwell.icns"

plutil -lint "$CONTENTS_DIR/Info.plist" "$ENTITLEMENTS" >/dev/null
if [[ "$SANDBOX" -eq 1 ]]; then
  codesign --force --sign - --entitlements "$ENTITLEMENTS" "$APP_DIR" >/dev/null
else
  codesign --force --sign - "$APP_DIR" >/dev/null
fi

printf 'Built %s\n' "$APP_DIR"
