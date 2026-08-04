const CACHE = "__CACHE_VERSION__";

const PRECACHE_URLS = [
    "/",
    "/styles.css",
    "/script.js",
    "/manifest.json",
    "/icons/icon-192.svg",
    "/icons/icon-512.svg",
];

// Install: pre-cache key assets
self.addEventListener("install", (event) => {
    event.waitUntil(
        caches.open(CACHE).then((cache) => cache.addAll(PRECACHE_URLS))
    );
    self.skipWaiting();
});

// Activate: clean old caches
self.addEventListener("activate", (event) => {
    event.waitUntil(
        caches.keys().then((keys) =>
            Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)))
        )
    );
    self.clients.claim();
});

// Helper: put a response in the cache
function cacheResponse(request, response) {
    if (response && response.status === 200) {
        const clone = response.clone();
        caches.open(CACHE).then((cache) => cache.put(request, clone));
    }
}

// Fetch: smart strategy
//   - Navigation (HTML) & API (/history): network-first → always fresh
//   - Static assets (JS, CSS, images): cache-first → fast offline loads
self.addEventListener("fetch", (event) => {
    const { request } = event;
    const url = new URL(request.url);

    // --- Same-origin checks only ---
    if (url.origin !== location.origin) return;

    // API / realtime — never cache, let the browser handle them
    if (
        url.pathname === "/history" ||
        url.pathname === "/subscribe" ||
        url.pathname === "/ws"
    ) {
        return;
    }

    // Navigation (HTML) → network-first, fall back to cache
    if (request.mode === "navigate") {
        event.respondWith(
            fetch(request)
                .then((response) => {
                    cacheResponse(request, response);
                    return response;
                })
                .catch(() => caches.match(request))
        );
        return;
    }

    // Static assets → cache-first, update cache in background
    event.respondWith(
        caches.match(request).then((cached) => {
            const fetchPromise = fetch(request).then((response) => {
                cacheResponse(request, response);
                return response;
            });
            return cached || fetchPromise;
        })
    );
});

// web push
self.addEventListener("push", (event) => {
    const data = event.data ? event.data.json() : {};
    event.waitUntil(
        (async () => {
            // Show system notification
            await self.registration.showNotification(data.user || "chatski", {
                body: data.text || "New message",
                icon: "/icons/icon-192.png", // prefer PNG on iOS (see below)
                badge: "/icons/favicon.png",
                tag: "chat",
            });

            // Home Screen badge (iOS 16.4+ / installed PWA)
            if (self.navigator.setAppBadge) {
                const count = data.count != null ? Number(data.count) : 1;
                try {
                await self.navigator.setAppBadge(count > 0 ? count : 1);
                } catch (e) {
                // ignore
                }
            }
        })()
    );
});

self.addEventListener("notificationclick", (event) => {
    event.notification.close();
    event.waitUntil(
        (async () => {
        if (self.navigator.clearAppBadge) {
            try {
            await self.navigator.clearAppBadge();
            } catch (e) {}
        }
        const list = await clients.matchAll({
            type: "window",
            includeUncontrolled: true,
        });
        if (list[0]) {
            await list[0].focus();
        } else {
            await clients.openWindow("/");
        }
        })()
    );
});