#!/usr/bin/env bash
# Runs the browser behaviour checks in headless Chromium.
# Set CHROME=/path/to/chrome to use a specific binary. Skips (exit 0) when no
# Chromium is available, so it stays usable on machines without one.
set -euo pipefail

root_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
tmp_dir="$(mktemp -d)"
trap 'rm -rf "$tmp_dir"' EXIT

find_chrome() {
  if [[ -n "${CHROME:-}" ]]; then
    if [[ -x "$CHROME" ]]; then
      echo "$CHROME"
    fi
    return
  fi
  local candidate
  for candidate in \
    "$(command -v chromium || true)" \
    "$(command -v chromium-browser || true)" \
    "$(command -v google-chrome || true)" \
    "$HOME"/.cache/ms-playwright/chromium-*/chrome-linux/chrome \
    "$HOME"/.cache/puppeteer/chrome/*/chrome-linux64/chrome
  do
    if [[ -n "$candidate" && -x "$candidate" ]]; then
      echo "$candidate"
      return
    fi
  done
}

chrome="$(find_chrome)"
if [[ -z "$chrome" ]]; then
  if [[ -n "${CHROME:-}" ]]; then
    echo "browser test: CHROME=$CHROME を実行できません" >&2
    exit 1
  fi
  echo "browser test: skipped (Chromium が見つかりません。CHROME=/path/to/chrome で指定できます)"
  exit 0
fi

# $1 = page file, $2 = label
run_case() {
  local page="$1" label="$2" results
  # The dumped DOM contains both the rendered results and the test source, so
  # pick the first <pre id="testout"> block only.
  results="$("$chrome" --headless --no-sandbox --disable-gpu --virtual-time-budget=15000 \
    --dump-dom "file://$page" 2>/dev/null | python3 -c '
import html, re, sys

dom = sys.stdin.read()
match = re.search(r"<pre id=\"testout\">(.*?)</pre>", dom, re.S)
if not match:
    sys.exit(1)
print(html.unescape(match.group(1)).strip())
')"
  if [[ -z "$results" ]]; then
    echo "browser test: $label の結果を取得できませんでした"
    return 1
  fi
  printf '%s\n' "$results"
  if printf '%s' "$results" | grep -q '^FAIL'; then
    return 1
  fi
  return 0
}

# Case 1: normal behaviour.
python3 - "$root_dir" "$tmp_dir" <<'PY'
import sys
from pathlib import Path

root, tmp = Path(sys.argv[1]), Path(sys.argv[2])
html = root.joinpath("index.html").read_text(encoding="utf-8")
checks = root.joinpath("tests/ui-checks.js").read_text(encoding="utf-8")
tmp.joinpath("ui.html").write_text(
    html.replace("</body>", f"  <script>\n{checks}\n  </script>\n</body>"), encoding="utf-8"
)

storage = root.joinpath("tests/storage-checks.js").read_text(encoding="utf-8")
guard = """  <script>
    const realSetItem = Storage.prototype.setItem;
    Storage.prototype.setItem = function (key) {
      if (String(key).startsWith("familytree.")) {
        const error = new Error("quota");
        error.name = "QuotaExceededError";
        throw error;
      }
      return realSetItem.apply(this, arguments);
    };
  </script>
"""
tmp.joinpath("storage.html").write_text(
    html.replace("  <script>", guard + "  <script>", 1).replace(
        "</body>", f"  <script>\n{storage}\n  </script>\n</body>"
    ),
    encoding="utf-8",
)
PY

status=0
echo "--- 通常の操作 ---"
run_case "$tmp_dir/ui.html" "ui-checks" || status=1
echo "--- 保存できない環境 ---"
run_case "$tmp_dir/storage.html" "storage-checks" || status=1

if [[ "$status" -eq 0 ]]; then
  echo "browser test passed"
else
  echo "browser test failed"
fi
exit "$status"
