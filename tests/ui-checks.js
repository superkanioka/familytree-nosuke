// Browser behaviour checks for index.html.
// Injected into a temporary copy of the page by tests/browser.sh and run headless.
(async () => {
  const out = [];
  const ok = (name, cond, extra = "") => out.push(`${cond ? "PASS" : "FAIL"} ${name}${cond ? "" : " -- " + extra}`);
  const $ = (id) => document.getElementById(id);
  const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
  const dialog = $("confirmDialog");
  const count = () => JSON.parse($("jsonEditor").value).length;
  const waitFor = async (predicate, timeout = 1000) => {
    const deadline = Date.now() + timeout;
    while (Date.now() < deadline) {
      if (predicate()) return true;
      await wait(10);
    }
    return predicate();
  };
  // Wait for the confirmation dialog, press one of its buttons, and wait for it
  // to close. Returns false when the dialog never opened.
  const press = async (id) => {
    if (!(await waitFor(() => dialog.open))) return false;
    $(id).click();
    await waitFor(() => !dialog.open);
    await wait(20);
    return true;
  };

  try {
    const start = count();

    // --- Material 3 chrome is wired up ---
    const manual = $("manualLayoutBtn");
    manual.click();
    ok("配置調整: ラベルだけが入れ替わる", manual.querySelector(".btn-label").textContent === "配置調整を終了");
    ok("配置調整: アイコンが残る", !!manual.querySelector("svg use"));
    ok("配置調整: aria-pressed", manual.getAttribute("aria-pressed") === "true");
    ok("配置調整: 用紙に is-manual", document.querySelector(".paper").classList.contains("is-manual"));
    manual.click();
    ok("配置調整: ラベルが戻る", manual.querySelector(".btn-label").textContent === "配置調整");

    document.querySelector(".person-row button").dispatchEvent(new PointerEvent("pointerdown", { bubbles: true, clientX: 10, clientY: 10 }));
    ok("リップルが出る", !!document.querySelector(".ripple"));

    // --- duplicate IDs must not silently overwrite anybody ---
    $("newBtn").click();
    $("personId").value = "2";
    $("name").value = "上書きテスト";
    $("generation").value = "0";
    $("saveBtn").click();
    ok("重複IDを拒否する", count() === start && !$("jsonEditor").value.includes("上書きテスト"));
    ok("重複IDの持ち主を知らせる", $("status").textContent.includes("使用中"), $("status").textContent);
    ok("エラー配色になる", $("snackbar").classList.contains("is-error"));

    // --- a genuinely unused ID still saves ---
    $("newBtn").click();
    $("name").value = "新規テスト";
    $("generation").value = "0";
    $("saveBtn").click();
    ok("新規追加はできる", count() === start + 1 && $("jsonEditor").value.includes("新規テスト"), String(count()));

    // --- editing the selected person updates in place ---
    document.querySelector(".person-row button").click();
    const selected = Number($("personId").value);
    ok("編集で行が選択される", document.querySelectorAll(".person-row.is-selected").length === 1);
    $("name").value = "改名テスト";
    $("saveBtn").click();
    ok("その場で更新される", JSON.parse($("jsonEditor").value).find((item) => item.id === selected)?.name === "改名テスト");
    ok("行が増えない", count() === start + 1);

    // --- delete asks first; cancelling changes nothing ---
    const before = count();
    $("deleteBtn").click();
    ok("削除は確認ダイアログを開く", await press("confirmCancelBtn"));
    ok("キャンセルで消えない", count() === before, String(count()));

    // --- confirming deletes, and undo brings the person back ---
    $("deleteBtn").click();
    await press("confirmOkBtn");
    ok("確認すると削除される", count() === before - 1, String(count()));
    const afterDelete = JSON.parse($("jsonEditor").value);
    ok("参照も外れる", !afterDelete.some((item) => item.parentIds.includes(selected) || item.spouseIds.includes(selected)));
    ok("元に戻すが出る", !$("undoBtn").hidden);
    $("undoBtn").click();
    await wait(20);
    ok("元に戻すで復活する", count() === before && JSON.parse($("jsonEditor").value).some((item) => item.id === selected), String(count()));
    ok("元に戻すは一度だけ", $("undoBtn").hidden);

    // --- the dialog can be reused ---
    $("deleteBtn").click();
    await press("confirmOkBtn");
    ok("2回目の削除も動く", count() === before - 1, String(count()));
    $("undoBtn").click();
    await wait(20);

    // --- deleting with nothing selected is refused ---
    $("newBtn").click();
    $("deleteBtn").click();
    await wait(20);
    ok("未選択なら削除しない", !dialog.open && $("status").textContent.includes("選ばれていません"), $("status").textContent);

    // --- double clicking a destructive button must not break the dialog ---
    document.querySelector(".person-row button").click();
    const beforeDouble = count();
    $("deleteBtn").click();
    $("deleteBtn").click();
    ok("二重クリックでも確認は1回", await press("confirmCancelBtn"));
    ok("二重クリック後もダイアログは閉じる", !dialog.open);
    ok("二重クリックで消えない", count() === beforeDouble, String(count()));
    $("deleteBtn").click();
    ok("その後も削除できる", await press("confirmOkBtn"));
    ok("削除が反映される", count() === beforeDouble - 1, String(count()));
    $("undoBtn").click();
    await wait(20);
    ok("戻せる", count() === beforeDouble, String(count()));

    // --- sample restore asks first and is undoable ---
    $("sampleBtn").click();
    ok("サンプル復元も確認する", await press("confirmCancelBtn"));
    ok("キャンセルでデータが残る", $("jsonEditor").value.includes("改名テスト"));
    $("sampleBtn").click();
    await press("confirmOkBtn");
    ok("サンプル復元が効く", !$("jsonEditor").value.includes("改名テスト"));
    ok("サンプル復元も元に戻せる", !$("undoBtn").hidden);
    $("undoBtn").click();
    await wait(20);
    ok("元に戻すとデータが戻る", $("jsonEditor").value.includes("改名テスト"));

    // --- automatic backups ---
    const backups = JSON.parse(localStorage.getItem("familytree.backups") || "[]");
    ok("バックアップが保存される", backups.length > 0, String(backups.length));
    ok("バックアップは5件まで", backups.length <= 5, String(backups.length));
    ok("バックアップ欄が出る", !$("backupBox").hidden);
    const restoreBtn = $("backupList").querySelector("button");
    ok("バックアップ行が並ぶ", !!restoreBtn);
    if (restoreBtn) {
      restoreBtn.click();
      await press("confirmOkBtn");
      ok("バックアップから復元できる", $("status").textContent.includes("バックアップから復元"), $("status").textContent);
    }

    // --- broken JSON reports and keeps the stored data ---
    const keep = count();
    $("jsonEditor").value = "{ broken";
    $("applyJsonBtn").click();
    await wait(10);
    ok("壊れたJSONを知らせる", $("status").textContent.includes("JSONエラー"), $("status").textContent);
    ok("壊れたJSONでデータを失わない", JSON.parse(localStorage.getItem("familytree.people")).length === keep);

    // --- the sheet still renders ---
    ok("Canvasが描画される", $("treeCanvas").width > 0 && $("treeCanvas").height > 0);
  } catch (error) {
    out.push(`FAIL 例外が出た -- ${error && error.message}`);
  }

  document.title = "done";
  document.body.insertAdjacentHTML("afterbegin", `<pre id="testout">${out.join("\n")}</pre>`);
})();
