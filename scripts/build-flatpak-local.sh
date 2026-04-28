#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
MANIFEST="$ROOT_DIR/packaging/flatpak/io.github.VendorBuyMVP.Inkwell.yml"
BUILD_DIR="$ROOT_DIR/build/flatpak-io.github.VendorBuyMVP.Inkwell"
REPO_DIR="$ROOT_DIR/build/flatpak-repo-io.github.VendorBuyMVP.Inkwell"

if command -v flatpak-builder >/dev/null 2>&1; then
  flatpak-builder --force-clean --user --install --repo="$REPO_DIR" --mirror-screenshots-url=https://dl.flathub.org/media --compose-url-policy=full "$BUILD_DIR" "$MANIFEST"
elif flatpak list --app --columns=application 2>/dev/null | grep -qx 'org.flatpak.Builder'; then
  flatpak run --command=flatpak-builder org.flatpak.Builder --force-clean --user --install --repo="$REPO_DIR" --mirror-screenshots-url=https://dl.flathub.org/media --compose-url-policy=full "$BUILD_DIR" "$MANIFEST"
else
  printf 'flatpak-builder is required. Install org.flatpak.Builder from Flathub or the flatpak-builder package.\n' >&2
  exit 1
fi
