const CACHE = "go-chat-v1";

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

// Fetch: serve from cache, fall back to network
self.addEventListener("fetch", (event) => {
    event.respondWith(
        caches.match(event.request).then((cached) => {
            const fetchPromise = fetch(event.request).then((response) => {
                if (response && response.status === 200) {
                    const clone = response.clone();
                    caches.open(CACHE).then((cache) => cache.put(event.request, clone));
                }
                return response;
            });
            return cached || fetchPromise;
        })
    );
});
