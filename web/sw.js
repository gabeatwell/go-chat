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

    // API calls → network only (never cache)
    if (url.pathname === "/history") {
        event.respondWith(fetch(request));
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
