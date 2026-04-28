#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
APP_ID="io.github.VendorBuyMVP.Inkwell"
MANIFEST="$ROOT_DIR/packaging/flatpak/$APP_ID.yml"
DESKTOP_FILE="$ROOT_DIR/packaging/linux/$APP_ID.desktop"
METAINFO_FILE="$ROOT_DIR/packaging/linux/$APP_ID.metainfo.xml"
REPO_DIR="$ROOT_DIR/build/flatpak-repo-$APP_ID"

desktop-file-validate "$DESKTOP_FILE"
xmllint --noout "$METAINFO_FILE"
appstreamcli validate --no-net "$METAINFO_FILE"

if grep -Eq -- '--share=network|--filesystem=' "$MANIFEST"; then
  printf 'Flatpak manifest requests network or broad filesystem permissions.\n' >&2
  exit 1
fi

if ! grep -q -- '--socket=wayland' "$MANIFEST"; then
  printf 'Flatpak manifest must request the Wayland socket.\n' >&2
  exit 1
fi

if ! grep -q -- '--socket=fallback-x11' "$MANIFEST"; then
  printf 'Flatpak manifest must request fallback X11 only, not broad X11.\n' >&2
  exit 1
fi

if grep -q -- '--socket=x11' "$MANIFEST"; then
  printf 'Flatpak manifest must not request broad X11.\n' >&2
  exit 1
fi

if command -v flatpak-builder-lint >/dev/null 2>&1; then
  flatpak-builder-lint manifest "$MANIFEST"
  if [[ -d "$REPO_DIR/objects" ]]; then
    flatpak-builder-lint repo "$REPO_DIR"
  fi
elif flatpak list --app --columns=application 2>/dev/null | grep -qx 'org.flatpak.Builder'; then
  flatpak run --command=flatpak-builder-lint org.flatpak.Builder manifest "$MANIFEST"
  if [[ -d "$REPO_DIR/objects" ]]; then
    flatpak run --command=flatpak-builder-lint org.flatpak.Builder repo "$REPO_DIR"
  fi
else
  printf 'Skipping flatpak-builder-lint: flatpak-builder-lint is not installed.\n' >&2
fi

if flatpak info "$APP_ID" >/dev/null 2>&1; then
  permissions="$(flatpak info --show-permissions "$APP_ID")"
  printf '%s\n' "$permissions"
  if printf '%s\n' "$permissions" | grep -Eq 'shared=network|filesystems='; then
    printf 'Flatpak permissions are too broad.\n' >&2
    exit 1
  fi
else
  printf 'Skipping installed permission audit: %s is not installed locally.\n' "$APP_ID" >&2
fi
