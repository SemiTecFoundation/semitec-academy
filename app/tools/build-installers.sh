#!/usr/bin/env bash
# build-installers.sh — build the SemiTec Academy installer(s) for THIS computer's system.
#   macOS   → installers/<version>/SemiTec-Academy-<version>-mac-arm64.dmg / -x64.dmg
#   Linux   → SemiTec-Academy-<version>-linux-x86_64.AppImage, semitec-academy_<version>_amd64.deb
#   Windows → run in Git Bash, or:  npm ci && npm run dist:win
# Usage (from anywhere):  bash Foundation/Products/Academy/app/tools/build-installers.sh [--skip-tests]
set -euo pipefail
cd "$(dirname "$0")/.."
command -v node >/dev/null || { echo "Node.js 20+ is needed: https://nodejs.org"; exit 1; }
echo "▸ installing dependencies for $(uname -s) (fresh, so Electron matches this system)"
rm -rf node_modules
npm ci --no-audit --no-fund
if [[ "${1:-}" != "--skip-tests" ]]; then
  echo "▸ end-to-end tests"
  if [[ "$(uname -s)" == "Linux" ]] && command -v xvfb-run >/dev/null; then xvfb-run -a npm test; else npm test; fi
fi
case "$(uname -s)" in
  Darwin) npm run dist:mac ;;
  Linux)  npm run dist:linux ;;
  MINGW*|MSYS*|CYGWIN*) npm run dist:win ;;
  *) echo "unknown system $(uname -s)"; exit 1 ;;
esac
V=$(node -p "require('./package.json').version")
echo; echo "✓ installers in Products/Academy/installers/$V:"; ls -1 "../installers/$V" | grep -vE 'unpacked|^mac|blockmap|builder-'
