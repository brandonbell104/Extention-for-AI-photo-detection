#!/bin/bash
#
# Build script for Image Noise Pattern Analyzer
# Creates distributable zip files for each browser store
#
# Usage: ./build.sh
#
# Output:
#   dist/chrome/   - Chrome Web Store package (.zip)
#   dist/firefox/  - Firefox Add-ons package (.zip)
#   dist/edge/     - Edge Add-ons package (.zip)
#

set -e

VERSION=$(grep '"version"' manifest.json | head -1 | sed 's/.*: *"\(.*\)".*/\1/')
echo "Building Image Noise Pattern Analyzer v${VERSION}"
echo "================================================"

# Clean previous builds
rm -rf dist
mkdir -p dist/chrome dist/firefox dist/edge

# Shared files used by all browsers
SHARED_FILES=(
  content.js
  content.css
  popup.html
  popup.js
  sidepanel.html
  icon16.png
  icon48.png
  icon128.png
)

# ---- Chrome ----
echo ""
echo "[Chrome] Building..."
for f in "${SHARED_FILES[@]}"; do
  cp "$f" dist/chrome/
done
cp manifest.json dist/chrome/manifest.json
cp background.js dist/chrome/background.js
(cd dist/chrome && zip -r "../noise-analyzer-chrome-v${VERSION}.zip" . -x ".*")
echo "[Chrome] Done -> dist/noise-analyzer-chrome-v${VERSION}.zip"

# ---- Edge ----
# Edge is Chromium-based and uses the exact same package as Chrome
echo ""
echo "[Edge] Building..."
for f in "${SHARED_FILES[@]}"; do
  cp "$f" dist/edge/
done
cp manifest.json dist/edge/manifest.json
cp background.js dist/edge/background.js
(cd dist/edge && zip -r "../noise-analyzer-edge-v${VERSION}.zip" . -x ".*")
echo "[Edge] Done -> dist/noise-analyzer-edge-v${VERSION}.zip"

# ---- Firefox ----
echo ""
echo "[Firefox] Building..."
for f in "${SHARED_FILES[@]}"; do
  cp "$f" dist/firefox/
done
cp manifest_firefox.json dist/firefox/manifest.json
cp background_firefox.js dist/firefox/background_firefox.js
(cd dist/firefox && zip -r "../noise-analyzer-firefox-v${VERSION}.zip" . -x ".*")
echo "[Firefox] Done -> dist/noise-analyzer-firefox-v${VERSION}.zip"

echo ""
echo "================================================"
echo "All builds complete! Packages in dist/"
echo ""
echo "To publish:"
echo "  Chrome  -> https://chrome.google.com/webstore/devconsole"
echo "  Edge    -> https://partner.microsoft.com/en-us/dashboard/microsoftedge"
echo "  Firefox -> https://addons.mozilla.org/en-US/developers/"
echo "  Safari  -> Run: xcrun safari-web-extension-converter dist/chrome"
echo "             Then build in Xcode and submit via App Store Connect"
