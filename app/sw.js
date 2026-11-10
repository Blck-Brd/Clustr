const CACHE_NAME = 'clustr-shell-v21';
const APP_SHELL = [
    './',
    './index.html',
    './manifest.webmanifest',
    './exif-worker.js',
    './geo-worker.js',
    './preview-worker.js',
    './vendor/exifr.full.umd.js',
    './vendor/utif.js',
    './vendor/heic2any.min.js',
    './icons/icon-192.png',
    './icons/icon-512.png',
    './icons/favicon.png',
    './icons/apple-touch-icon.png'
];

const CACHEABLE_CDNS = new Set([
    'unpkg.com',
    'cdn.jsdelivr.net',
    'cdn.tailwindcss.com',
    'www.gstatic.com'
]);

self.addEventListener('install', (event) => {
    event.waitUntil(
        caches.open(CACHE_NAME)
            .then((cache) => cache.addAll(APP_SHELL))
            .then(() => self.skipWaiting())
    );
});

self.addEventListener('activate', (event) => {
    event.waitUntil(
        caches.keys()
            .then((keys) => Promise.all(keys.filter((key) => key !== CACHE_NAME).map((key) => caches.delete(key))))
            .then(() => self.clients.claim())
    );
});

self.addEventListener('message', (event) => {
    if (event.data === 'SKIP_WAITING') self.skipWaiting();
});

self.addEventListener('fetch', (event) => {
    const request = event.request;
    if (request.method !== 'GET') return;

    const url = new URL(request.url);

    if (url.origin !== self.location.origin) {
        if (!CACHEABLE_CDNS.has(url.hostname)) return;

        event.respondWith((async () => {
            const cache = await caches.open(CACHE_NAME);
            const cached = await cache.match(request);
            const network = fetch(request)
                .then((response) => {
                    if (response && response.ok) cache.put(request, response.clone());
                    return response;
                })
                .catch(() => cached);
            return cached || network;
        })());
        return;
    }

    if (request.mode === 'navigate') {
        event.respondWith(
            fetch(request)
                .then((response) => {
                    const copy = response.clone();
                    caches.open(CACHE_NAME).then((cache) => cache.put('./index.html', copy));
                    return response;
                })
                .catch(() => caches.match('./index.html'))
        );
        return;
    }

    event.respondWith(
        caches.match(request).then((cached) => cached || fetch(request).then((response) => {
            if (response && response.ok) {
                const copy = response.clone();
                caches.open(CACHE_NAME).then((cache) => cache.put(request, copy));
            }
            return response;
        }))
    );
});








