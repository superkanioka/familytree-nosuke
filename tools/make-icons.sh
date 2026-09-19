#!/usr/bin/env bash
# src/app-icon.svg から PWA 用の PNG アイコンを作り直す。
# 生成結果（icons/*.png）はコミットするので、通常のビルドやテストでは実行不要。
# Chromium が要る: CHROME=/path/to/chrome tools/make-icons.sh
set -euo pipefail

root_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
tmp_dir="$(mktemp -d)"
trap 'rm -rf "$tmp_dir"' EXIT

find_chrome() {
  if [[ -n "${CHROME:-}" ]]; then
    [[ -x "$CHROME" ]] && echo "$CHROME"
    return
  fi
  local candidate
  for candidate in \
    "$(command -v chromium || true)" \
    "$(command -v chromium-browser || true)" \
    "$(command -v google-chrome || true)" \
    "$HOME"/.cache/ms-playwright/chromium-*/chrome-linux/chrome
  do
    if [[ -n "$candidate" && -x "$candidate" ]]; then
      echo "$candidate"
      return
    fi
  done
}

chrome="$(find_chrome)"
if [[ -z "$chrome" ]]; then
  echo "make-icons: Chromium が見つかりません。CHROME=/path/to/chrome を指定してください。" >&2
  exit 1
fi

for size in 192 512; do
  cat > "$tmp_dir/icon-$size.html" <<HTML
<!doctype html><meta charset="utf-8">
<style>html,body{margin:0;padding:0;width:${size}px;height:${size}px;overflow:hidden}svg{display:block;width:${size}px;height:${size}px}</style>
$(cat "$root_dir/src/app-icon.svg")
HTML
  "$chrome" --headless --no-sandbox --disable-gpu --hide-scrollbars \
    --force-device-scale-factor=1 --window-size="$size,$size" \
    --screenshot="$root_dir/icons/icon-$size.png" \
    --virtual-time-budget=1500 "file://$tmp_dir/icon-$size.html" >/dev/null 2>&1
  echo "icons/icon-$size.png"
done
