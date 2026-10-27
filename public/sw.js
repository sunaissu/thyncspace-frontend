const CACHE_PREFIX = "thyncspace-pwa";
const CACHE_VERSION = "v8";
const STATIC_CACHE = `${CACHE_PREFIX}-${CACHE_VERSION}`;
const PRECACHE_URLS = [
  "/offline.html",
  "/offline-library/",
  "/manifest.webmanifest",
  "/favicon.ico",
  "/theme-init.js",
  "/icons/icon.svg",
  "/icons/icon-192.png",
  "/icons/icon-512.png",
  "/icons/icon-512-maskable.png",
  "/icons/apple-touch-icon.png",
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(STATIC_CACHE).then(async cache => {
      await cache.addAll(PRECACHE_URLS);
      // Prepare the public offline shell before activating a new cache version,
      // so upgrades do not strand retained IndexedDB notes without their editor.
      const shell = await cache.match("/offline-library/");
      const html = await shell.text();
      const assets = [...new Set([...html.matchAll(/(?:src|href)="(\/_next\/static\/[^"?#]+)"/g)].map(match => match[1]))];
      await cache.addAll(assets);
    }),
  );
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(
          keys
            .filter(
              (key) => key.startsWith(`${CACHE_PREFIX}-`) && key !== STATIC_CACHE,
            )
            .map((key) => caches.delete(key)),
        ),
      )
      .then(() => self.clients.claim()),
  );
});

self.addEventListener("fetch", (event) => {
  const { request } = event;

  if (request.method !== "GET") {
    return;
  }

  const url = new URL(request.url);

  // Never intercept the cross-origin backend, third-party resources, or
  // authenticated API traffic. Notes and session data remain network-only.
  if (url.origin !== self.location.origin || url.pathname.startsWith("/api/")) {
    return;
  }

  if (request.mode === "navigate") {
    event.respondWith(fetch(request).then(response => {
      if (url.pathname.replace(/\/$/, "") === "/offline-library" && response.ok && response.type === "basic") { const copy = response.clone(); event.waitUntil(caches.open(STATIC_CACHE).then(cache => cache.put("/offline-library/", copy))); }
      return response;
    }).catch(async () => {
      if (url.pathname.replace(/\/$/, "") === "/offline-library") { const saved = await caches.match("/offline-library/"); if (saved) return saved; }
      return caches.match("/offline.html");
    }));
    return;
  }

  if (PRECACHE_URLS.includes(url.pathname)) {
    event.respondWith(
      caches.match(url.pathname).then((cachedResponse) => {
        return cachedResponse ?? fetch(request);
      }),
    );
    return;
  }

  // Next.js fingerprints production assets, making cache-first safe here.
  if (url.pathname.startsWith("/_next/static/")) {
    event.respondWith(
      caches.match(request).then((cachedResponse) => {
        if (cachedResponse) {
          return cachedResponse;
        }

        return fetch(request).then((networkResponse) => {
          if (networkResponse.ok && networkResponse.type === "basic") {
            const responseToCache = networkResponse.clone();
            void caches
              .open(STATIC_CACHE)
              .then((cache) => cache.put(request, responseToCache));
          }
          return networkResponse;
        });
      }),
    );
  }
});

self.addEventListener("notificationclick", event => {
  event.notification.close();
  event.waitUntil((async () => {
    const windows = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
    const existing = windows.find(client => new URL(client.url).origin === self.location.origin && new URL(client.url).pathname.replace(/\/$/, "") === "/notes");
    if (existing) { existing.postMessage({ type: "open-reminders" }); await existing.focus(); }
    else await self.clients.openWindow("/notes/?reminders=1");
  })());
});
