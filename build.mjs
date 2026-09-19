#!/usr/bin/env node
// src/ から配布物（index.html / manifest.webmanifest / sw.js）を生成する。依存パッケージはなし。
//
//   node build.mjs           生成物を書き出す
//   node build.mjs --check   生成物が src/ と一致するか確認する（CI・テスト用）
//
// index.html 1枚で完結する配布は変えていない。manifest と sw.js は
// http(s) で配信したときだけ効く追加物で、file:// では無視される。
import { createHash } from "node:crypto";
import { readFile, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = dirname(fileURLToPath(import.meta.url));

// 読み込み順 = 依存順。import/export を取り除いて素直に連結する。
const MODULES = ["src/data.js", "src/layout.js", "src/draw.js", "src/app.js"];

// Service Worker が最初にキャッシュする一式。
const SHELL_ASSETS = ["./", "./index.html", "./manifest.webmanifest", "./icons/icon-192.png", "./icons/icon-512.png"];
const ICON_FILES = ["icons/icon-192.png", "icons/icon-512.png"];

const BANNER = "<!-- このファイルは build.mjs が生成します。編集は src/ 側で行い、node build.mjs を実行してください。 -->";

function stripModuleSyntax(source, file) {
  const stripped = source
    .replace(/^import\s+[^;]*;\n/gm, "")
    .replace(/^export\s+/gm, "");
  if (/^\s*(?:import|export)\b/m.test(stripped)) {
    throw new Error(`${file}: 取り除けない import/export が残っています（1行1文で書いてください）`);
  }
  return stripped.trim();
}

function indent(text, spaces) {
  const pad = " ".repeat(spaces);
  return text
    .split("\n")
    .map((line) => (line.trim() ? pad + line : line))
    .join("\n");
}

async function bundleScript() {
  const parts = [];
  for (const file of MODULES) {
    const source = await readFile(join(root, file), "utf8");
    parts.push(`// ---- ${file} ----\n${stripModuleSyntax(source, file)}`);
  }
  const bundle = `"use strict";\n\n${parts.join("\n\n")}`;
  // 実行せずに構文だけ検査する。
  // eslint-disable-next-line no-new-func
  new Function(bundle);
  return bundle;
}

async function buildHtml() {
  const [template, styles, icons, script] = await Promise.all([
    readFile(join(root, "src/index.template.html"), "utf8"),
    readFile(join(root, "src/styles.css"), "utf8"),
    readFile(join(root, "src/icons.svg"), "utf8"),
    bundleScript()
  ]);

  const html = template
    .replace("<!doctype html>", () => `<!doctype html>\n${BANNER}`)
    .replace("{{styles}}", () => indent(styles.trimEnd(), 4))
    .replace("{{icons}}", () => indent(icons.trimEnd(), 2))
    .replace("{{script}}", () => indent(script, 4));

  const leftover = html.match(/\{\{\w+\}\}/);
  if (leftover) throw new Error(`未置換のプレースホルダがあります: ${leftover[0]}`);
  return html;
}

// 配布物の中身からキャッシュ名を作る。中身が変われば必ず別名になり、
// 端末に古い版が残り続けることがない。
function shellVersion(parts) {
  const hash = createHash("sha256");
  for (const part of parts) hash.update(part);
  return hash.digest("hex").slice(0, 12);
}

async function buildOutputs() {
  const html = await buildHtml();
  const manifest = await readFile(join(root, "src/manifest.webmanifest"), "utf8");
  const iconBytes = await Promise.all(ICON_FILES.map((file) => readFile(join(root, file))));
  const version = shellVersion([html, manifest, ...iconBytes]);

  const swTemplate = await readFile(join(root, "src/sw.template.js"), "utf8");
  const sw = swTemplate
    .replace("{{version}}", () => version)
    .replace("{{assets}}", () => JSON.stringify(SHELL_ASSETS));
  if (/\{\{\w+\}\}/.test(sw)) throw new Error("sw.js に未置換のプレースホルダがあります");

  return new Map([
    ["index.html", html],
    ["manifest.webmanifest", manifest],
    ["sw.js", sw]
  ]);
}

const outputs = await buildOutputs();

if (process.argv.includes("--check")) {
  const stale = [];
  for (const [file, content] of outputs) {
    const current = await readFile(join(root, file), "utf8").catch(() => "");
    if (current !== content) stale.push(file);
  }
  if (stale.length) {
    console.error(`build check failed: ${stale.join(", ")} が src/ と一致しません。node build.mjs を実行してください。`);
    process.exit(1);
  }
  console.log(`build check passed: ${[...outputs.keys()].join(" / ")} は src/ と一致しています`);
} else {
  for (const [file, content] of outputs) {
    await writeFile(join(root, file), content);
  }
  const sizes = [...outputs].map(([file, content]) => `${file} (${content.length} bytes)`);
  console.log(`built ${sizes.join(", ")}`);
}
