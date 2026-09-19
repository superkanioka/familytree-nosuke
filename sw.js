// このファイルは build.mjs が src/sw.template.js から生成します。
// キャッシュ名のバージョンは配布物の内容から作るので、中身が変われば必ず入れ替わります。
const CACHE_NAME = "familytree-a27692a15103";
const ASSETS = ["./","./index.html","./manifest.webmanifest","./icons/icon-192.png","./icons/icon-512.png"];

self.addEventListener("install", (event) => {
  event.waitUntil((async () => {
    const cache = await caches.open(CACHE_NAME);
    await cache.addAll(ASSETS);
    await self.skipWaiting();
  })());
});

self.addEventListener("activate", (event) => {
  event.waitUntil((async () => {
    const names = await caches.keys();
    await Promise.all(names.filter((name) => name !== CACHE_NAME).map((name) => caches.delete(name)));
    await self.clients.claim();
  })());
});

self.addEventListener("fetch", (event) => {
  const request = event.request;
  if (request.method !== "GET") return;
  if (new URL(request.url).origin !== self.location.origin) return;

  // 本体は「つながっていれば最新、つながらなければキャッシュ」。
  // これで更新が届かなくなることがなく、オフラインでも開ける。
  if (request.mode === "navigate") {
    event.respondWith((async () => {
      try {
        const response = await fetch(request);
        const cache = await caches.open(CACHE_NAME);
        cache.put("./", response.clone());
        return response;
      } catch {
        const cached = await caches.match("./") ?? await caches.match("./index.html");
        return cached ?? Response.error();
      }
    })());
    return;
  }

  // アイコンなどは中身が変わらないので、キャッシュを先に見る。
  event.respondWith((async () => {
    const cached = await caches.match(request);
    return cached ?? fetch(request);
  })());
});
