// Service Worker for now.gg proxy
const CACHE_NAME = 'nowgg-proxy-v1';
const NOW_GG_DOMAINS = ['now.gg', 'nowgg.me', 'play.now.gg'];
const CACHEABLE_EXTENSIONS = ['.js', '.css', '.png', '.jpg', '.jpeg', '.gif', '.svg', '.woff', '.woff2'];

// Install event
self.addEventListener('install', (event) => {
    self.skipWaiting();
});

// Activate event
self.addEventListener('activate', (event) => {
    event.waitUntil(
        caches.keys().then((cacheNames) => {
            return Promise.all(
                cacheNames
                    .filter((name) => name !== CACHE_NAME)
                    .map((name) => caches.delete(name))
            );
        }).then(() => self.clients.claim())
    );
});

// Check if URL is for now.gg domain
function isNowGgUrl(url) {
    try {
        const parsedUrl = new URL(url);
        return NOW_GG_DOMAINS.some(domain => parsedUrl.hostname.includes(domain));
    } catch {
        return false;
    }
}

// Check if URL is cacheable
function isCacheable(url) {
    const lowerUrl = url.toLowerCase();
    return CACHEABLE_EXTENSIONS.some(ext => lowerUrl.endsWith(ext));
}

// Fetch event - intercept and proxy requests
self.addEventListener('fetch', (event) => {
    const url = event.request.url;
    
    // Only intercept now.gg related requests
    if (!isNowGgUrl(url)) {
        return;
    }

    event.respondWith(
        (async () => {
            try {
                // Build proxy URL
                const proxyUrl = `/bare/v1/proxy?url=${encodeURIComponent(url)}`;
                
                // Create proxy request
                const requestInit = {
                    method: event.request.method,
                    headers: event.request.headers,
                    credentials: 'include',
                    mode: 'cors'
                };

                // Only include body for methods that support it
                if (event.request.method !== 'GET' && event.request.method !== 'HEAD') {
                    requestInit.body = event.request.body;
                }
                
                const proxyRequest = new Request(proxyUrl, requestInit);
                const response = await fetch(proxyRequest);
                
                // Cache static assets
                if (response.ok && isCacheable(url)) {
                    const cache = await caches.open(CACHE_NAME);
                    cache.put(event.request, response.clone());
                }
                
                return response;
            } catch (error) {
                // Try cache fallback
                const cachedResponse = await caches.match(event.request);
                if (cachedResponse) {
                    return cachedResponse;
                }
                
                // Return error response
                return new Response(JSON.stringify({ error: error.message }), {
                    status: 502,
                    headers: { 'Content-Type': 'application/json' }
                });
            }
        })()
    );
});

// Message handler for communication with main thread
self.addEventListener('message', (event) => {
    if (event.data && event.data.type === 'SKIP_WAITING') {
        self.skipWaiting();
    }
});
