#!/bin/sh
# Builds "build/Bifrost Numpad.app" (universal: Apple silicon and Intel).
# --release also copies it to dist/, which is committed: designers get the app
# with git pull and never build it themselves.
#
# Signs ad hoc unless SIGN_IDENTITY is set, e.g.
#   SIGN_IDENTITY="Developer ID Application: Intility AS (TEAMID)" ./build.sh
# macOS ties the Accessibility permission to the binary, so every new build has
# to be granted again. That's why dist/ only changes on a release.
set -e
cd "$(dirname "$0")"

swift build -c release --arch arm64 --arch x86_64
BIN="$(swift build -c release --arch arm64 --arch x86_64 --show-bin-path)/BifrostNumpad"

APP="build/Bifrost Numpad.app"
rm -rf "$APP"
mkdir -p "$APP/Contents/MacOS" "$APP/Contents/Resources"
cp Info.plist "$APP/Contents/"
cp "$BIN" "$APP/Contents/MacOS/"

# Both icons come from Resources/Logo.png: the menu bar one as is, the app icon
# (Finder, Spotlight) on a background, see app-icon.swift.
sips -z 64 64 Resources/Logo.png --out "$APP/Contents/Resources/MenuIcon.png" >/dev/null
ICONSET="build/AppIcon.iconset"
rm -rf "$ICONSET"
swift app-icon.swift Resources/Logo.png "$ICONSET"
iconutil -c icns "$ICONSET" -o "$APP/Contents/Resources/AppIcon.icns"
rm -rf "$ICONSET"

if [ -n "$SIGN_IDENTITY" ]; then
  codesign --force --options runtime --timestamp --sign "$SIGN_IDENTITY" "$APP"
else
  codesign --force --sign - "$APP"
fi
echo "Built $APP"

if [ "$1" = "--release" ]; then
  rm -rf "dist/Bifrost Numpad.app"
  mkdir -p dist
  ditto "$APP" "dist/Bifrost Numpad.app"
  codesign --verify --strict "dist/Bifrost Numpad.app"
  echo "Copied to dist/. Bump the version in Info.plist before releasing, then commit dist/."
fi
