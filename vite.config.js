import { defineConfig } from "vite";
import { svelte } from "@sveltejs/vite-plugin-svelte";
import { viteSingleFile } from "vite-plugin-singlefile";

// 配布物は dist/index.html 1枚に収める（file:// でも動く）。
// manifest / icons / sw.js は public/ から dist/ へそのままコピーされ、
// http(s) 配信のときだけ PWA として効く。
export default defineConfig({
  base: "./",
  plugins: [svelte(), viteSingleFile()],
  build: {
    outDir: "dist",
    assetsInlineLimit: 100000000,
    cssCodeSplit: false
  }
});
