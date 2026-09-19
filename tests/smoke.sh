#!/usr/bin/env bash
set -euo pipefail

root_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
port="${PORT:-8765}"
tmp_dir="$(mktemp -d)"
server_log="$tmp_dir/server.log"

cleanup() {
  if [[ -n "${server_pid:-}" ]]; then
    kill "$server_pid" 2>/dev/null || true
    wait "$server_pid" 2>/dev/null || true
  fi
  rm -rf "$tmp_dir"
}
trap cleanup EXIT

python3 -m http.server "$port" --directory "$root_dir" >"$server_log" 2>&1 &
server_pid=$!

python3 - "$port" <<'PY'
import sys
import time
from urllib.error import URLError
from urllib.request import urlopen

port = sys.argv[1]
url = f"http://127.0.0.1:{port}/index.html"
for _ in range(20):
    try:
        with urlopen(url, timeout=1) as response:
            html = response.read().decode("utf-8")
        break
    except (URLError, TimeoutError):
        time.sleep(0.1)
else:
    raise SystemExit("smoke test: static server did not respond")

required = [
    'id="relation"',
    'id="suggestRelationBtn"',
    'id="exportJsonBtn"',
    'id="importJsonBtn"',
    'id="printBtn"',
    'function suggestRelation()',
    'parentRelationshipTypes',
    'parentRelationshipType',
    'getParentLineStyle',
    'spouseIds',
    'spouseRelationshipTypes',
    'getSpouseLineStyle',
    'manualLayoutBtn',
    'resetLayoutBtn',
    'position',
    'handlePointerDown',
    'A3横',
    'A4横',
    '@page',
    'function exportJson()',
    'function importJsonFile',
    # 安全機能（削除確認・元に戻す・自動バックアップ・保存エラー検知）
    'id="confirmDialog"',
    'id="confirmOkBtn"',
    'id="confirmCancelBtn"',
    'id="undoBtn"',
    'id="backupList"',
    'function confirmAction',
    'async function deleteSelected',
    'function pushBackup',
    'function restoreSnapshot',
    'function checkStorage',
    'familytree.backups',
]
missing = [item for item in required if item not in html]
if missing:
    raise SystemExit(f"smoke test: missing required markers: {missing}")

for forbidden in ("jspdf", "jsPDF", "generatePdfLink", "pdfBtn"):
    if forbidden in html:
        raise SystemExit(f"smoke test: forbidden PDF reference remains: {forbidden}")

print("smoke test passed: index.html served, JSON/relation/print/safety UI present, PDF references absent")
PY
