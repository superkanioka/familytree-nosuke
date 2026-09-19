#!/usr/bin/env node
// PWAとしての振る舞いを、実際に http 配信して確かめる。
//
//   node tests/pwa.mjs
//
// Service Worker は file:// では動かないため、生成物一式を一時フォルダへ並べて
// python3 -m http.server で配信し、ヘッドレスChromiumをDevToolsプロトコルで操作する。
// --dump-dom では登録完了を待てないので、CDPで評価している。
// Chromium が無ければスキップする（CHROME=/path/to/chrome で指定可）。
import { spawn } from "node:child_process";
import { createServer } from "node:net";
import { access, cp, mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { constants } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { glob } from "node:fs/promises";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const results = [];
const ok = (name, condition, extra = "") => {
  results.push(`${condition ? "PASS" : "FAIL"} ${name}${condition ? "" : ` -- ${extra}`}`);
  return condition;
};

async function findChrome() {
  if (process.env.CHROME) {
    return (await exists(process.env.CHROME)) ? process.env.CHROME : null;
  }
  const candidates = ["/usr/bin/chromium", "/usr/bin/chromium-browser", "/usr/bin/google-chrome"];
  for await (const match of glob(join(process.env.HOME ?? "", ".cache/ms-playwright/chromium-*/chrome-linux/chrome"))) {
    candidates.push(match);
  }
  for (const candidate of candidates) {
    if (await exists(candidate)) return candidate;
  }
  return null;
}

async function exists(path) {
  try {
    await access(path, constants.X_OK);
    return true;
  } catch {
    return false;
  }
}

function freePort() {
  return new Promise((resolve, reject) => {
    const server = createServer();
    server.on("error", reject);
    server.listen(0, "127.0.0.1", () => {
      const { port } = server.address();
      server.close(() => resolve(port));
    });
  });
}

async function waitFor(check, { timeout = 15000, interval = 100, label = "条件" } = {}) {
  const deadline = Date.now() + timeout;
  let lastError = null;
  while (Date.now() < deadline) {
    try {
      const value = await check();
      if (value) return value;
    } catch (error) {
      lastError = error;
    }
    await new Promise((resolve) => setTimeout(resolve, interval));
  }
  throw new Error(`${label}を待てませんでした${lastError ? `: ${lastError.message}` : ""}`);
}

// --- 最小限のDevToolsプロトコルクライアント（依存パッケージなし） ---
class Session {
  #ws;
  #id = 0;
  #pending = new Map();

  constructor(ws) {
    this.#ws = ws;
    ws.addEventListener("message", (event) => {
      const message = JSON.parse(event.data);
      const entry = this.#pending.get(message.id);
      if (!entry) return;
      this.#pending.delete(message.id);
      if (message.error) entry.reject(new Error(message.error.message));
      else entry.resolve(message.result);
    });
  }

  static async open(webSocketDebuggerUrl) {
    const ws = new WebSocket(webSocketDebuggerUrl);
    await new Promise((resolve, reject) => {
      ws.addEventListener("open", resolve, { once: true });
      ws.addEventListener("error", () => reject(new Error("DevToolsに接続できません")), { once: true });
    });
    return new Session(ws);
  }

  send(method, params = {}) {
    const id = ++this.#id;
    return new Promise((resolve, reject) => {
      this.#pending.set(id, { resolve, reject });
      this.#ws.send(JSON.stringify({ id, method, params }));
    });
  }

  // ページ内で式を評価して値を取り出す。Promise は解決を待つ。
  async evaluate(expression) {
    const response = await this.send("Runtime.evaluate", {
      expression: `(async () => { return (${expression}); })()`,
      awaitPromise: true,
      returnByValue: true
    });
    if (response.exceptionDetails) {
      throw new Error(response.exceptionDetails.exception?.description ?? "評価に失敗しました");
    }
    return response.result.value;
  }

  close() {
    this.#ws.close();
  }
}

// GitHub Pages はリポジトリ名のサブパスで配信されるため、テストも同じ形にする。
// ルート直下を前提にした絶対パスが紛れ込んでいれば、ここで気づける。
const SITE_PATH = "familytree-nosuke";

async function stageSite() {
  const dir = await mkdtemp(join(tmpdir(), "familytree-pwa-"));
  const site = join(dir, SITE_PATH);
  await mkdir(site, { recursive: true });
  for (const name of ["index.html", "manifest.webmanifest", "sw.js"]) {
    await writeFile(join(site, name), await readFile(join(root, name)));
  }
  await cp(join(root, "icons"), join(site, "icons"), { recursive: true });
  return dir;
}

async function main() {
  const chrome = await findChrome();
  if (!chrome) {
    console.log("pwa test: skipped (Chromium が見つかりません。CHROME=/path/to/chrome で指定できます)");
    return 0;
  }

  const dir = await stageSite();
  const sitePort = await freePort();
  const debugPort = await freePort();
  const profile = join(dir, "profile");

  const server = spawn("python3", ["-m", "http.server", String(sitePort), "--directory", dir], { stdio: "ignore" });
  const browser = spawn(chrome, [
    "--headless",
    "--no-sandbox",
    "--disable-gpu",
    `--user-data-dir=${profile}`,
    `--remote-debugging-port=${debugPort}`,
    "about:blank"
  ], { stdio: "ignore" });

  let session = null;
  try {
    const origin = `http://127.0.0.1:${sitePort}/${SITE_PATH}/`;
    await waitFor(async () => (await fetch(origin)).ok, { label: "配信サーバーの起動" });
    await waitFor(async () => (await fetch(`http://127.0.0.1:${debugPort}/json/version`)).ok, { label: "ブラウザの起動" });

    const target = await (await fetch(`http://127.0.0.1:${debugPort}/json/new?${origin}`, { method: "PUT" })).json();
    session = await Session.open(target.webSocketDebuggerUrl);
    await session.send("Page.enable");
    await session.send("Network.enable");

    await waitFor(
      () => session.evaluate('document.readyState === "complete" && !!document.querySelector("link[rel=manifest]")'),
      { label: "ページの読み込み" }
    );

    // --- manifest ---
    const manifest = await session.evaluate(`
      fetch(document.querySelector('link[rel="manifest"]').href).then((response) => response.json())
    `);
    ok("manifestを配信できる", !!manifest);
    ok("アプリ名がある", typeof manifest.name === "string" && manifest.name.length > 0, manifest.name);
    ok("start_urlとscopeが相対", manifest.start_url === "./" && manifest.scope === "./", `${manifest.start_url} / ${manifest.scope}`);
    ok("standaloneで開く", manifest.display === "standalone", manifest.display);
    ok("192と512のアイコンを持つ",
      manifest.icons.some((icon) => icon.sizes === "192x192") && manifest.icons.some((icon) => icon.sizes === "512x512"));
    ok("maskableアイコンを持つ", manifest.icons.some((icon) => icon.purpose === "maskable"));

    const iconStatuses = await session.evaluate(`
      Promise.all([...new Set(${JSON.stringify(manifest.icons.map((icon) => icon.src))})].map(async (src) => {
        const response = await fetch(src);
        return { src, ok: response.ok, type: response.headers.get("content-type") };
      }))
    `);
    for (const icon of iconStatuses) {
      ok(`${icon.src} を配信できる`, icon.ok && String(icon.type).includes("png"), `${icon.ok} / ${icon.type}`);
    }

    // --- Service Worker ---
    // ready は「activeなworkerがいる」時点で解決するので、activating のことがある。
    // 状態が activated になるまで待たないと、たまたま落ちるテストになる。
    const activated = await waitFor(
      async () => (await session.evaluate('navigator.serviceWorker.ready.then((r) => r.active?.state ?? null)')) === "activated",
      { label: "Service Workerの有効化" }
    ).catch(() => false);
    const registration = await session.evaluate(`
      navigator.serviceWorker.ready.then((registration) => ({
        scope: registration.scope,
        state: registration.active?.state ?? null
      }))
    `);
    ok("Service Workerが有効になる", activated, registration.state);
    ok("スコープはサブパスに収まる", registration.scope === origin, registration.scope);
    ok("ページが制御下に入る", await waitFor(() => session.evaluate("!!navigator.serviceWorker.controller"), { label: "SWの制御" }));

    // --- キャッシュ ---
    const cacheState = await session.evaluate(`
      (async () => {
        const names = await caches.keys();
        const name = names.find((item) => item.startsWith("familytree-"));
        if (!name) return { names, name: null, cached: [] };
        const cache = await caches.open(name);
        const assets = ["./", "./index.html", "./manifest.webmanifest", "./icons/icon-192.png", "./icons/icon-512.png"];
        const cached = [];
        for (const asset of assets) {
          if (await cache.match(asset)) cached.push(asset);
        }
        return { names, name, cached };
      })()
    `);
    ok("バージョン付きのキャッシュができる", /^familytree-[0-9a-f]{12}$/.test(cacheState.name ?? ""), cacheState.names.join(","));
    for (const asset of ["./", "./index.html", "./manifest.webmanifest", "./icons/icon-192.png", "./icons/icon-512.png"]) {
      ok(`${asset} をキャッシュしている`, cacheState.cached.includes(asset), cacheState.cached.join(","));
    }

    // --- オフラインで開き直せるか ---
    // 配信サーバーを止めてしまえば、キャッシュから返せたかどうかに疑いがない。
    server.kill();
    await waitFor(async () => {
      try {
        await fetch(`${origin}sw.js`, { cache: "no-store" });
        return false;
      } catch {
        return true;
      }
    }, { label: "配信サーバーの停止" });
    ok("配信サーバーが止まっている", true);

    await session.send("Page.reload", { ignoreCache: false });
    await waitFor(
      () => session.evaluate('document.readyState === "complete" && !!document.getElementById("treeCanvas")'),
      { label: "オフラインでの読み込み" }
    );

    const offline = await session.evaluate(`
      ({
        networkDead: await fetch("./sw.js", { cache: "no-store" }).then(() => false, () => true),
        title: document.title,
        canvasWidth: document.getElementById("treeCanvas")?.width ?? 0,
        people: document.querySelectorAll(".person-row").length,
        toolbar: !!document.getElementById("printBtn")
      })
    `);
    ok("ネットワークは本当に落ちている", offline.networkDead, String(offline.networkDead));
    ok("サーバーが無くても開ける", offline.title.includes("家系図"), offline.title);
    ok("サーバーが無くても図を描ける", offline.canvasWidth > 0, String(offline.canvasWidth));
    ok("サーバーが無くても人物一覧が出る", offline.people > 0, String(offline.people));
    ok("サーバーが無くても操作UIがある", offline.toolbar);
  } finally {
    session?.close();
    browser.kill();
    server.kill();
    await new Promise((resolve) => setTimeout(resolve, 300));
    await rm(dir, { recursive: true, force: true, maxRetries: 3 }).catch(() => {});
  }

  return results.some((line) => line.startsWith("FAIL")) ? 1 : 0;
}

let exitCode = 1;
try {
  exitCode = await main();
} catch (error) {
  results.push(`FAIL 実行中に失敗した -- ${error.message}`);
}
for (const line of results) console.log(line);
console.log(exitCode === 0 ? "pwa test passed" : "pwa test failed");
process.exit(exitCode);
