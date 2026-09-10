#!/bin/bash
set -euo pipefail

REAL_CHROMIUM="${SIMKEEPER_REAL_CHROMIUM_EXECUTABLE:-/usr/bin/chromium}"

if [ ! -x "$REAL_CHROMIUM" ]; then
  echo "SIMKeeper: Chromium executable not found at $REAL_CHROMIUM" >&2
  exit 127
fi

args=()
for arg in "$@"; do
  case "$arg" in
    --headless|--headless=*|--ozone-platform=headless)
      # Playwright still requests its normal headless launch profile. The VOXI
      # runtime intentionally upgrades that process to a regular headed Chromium
      # attached to Xvfb so Cloudflare sees the standard browser rendering path.
      ;;
    *)
      args+=("$arg")
      ;;
  esac
done

exec "$REAL_CHROMIUM" --ozone-platform=x11 "${args[@]}"
