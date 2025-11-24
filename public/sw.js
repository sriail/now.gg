// Service Worker for now.gg proxy
const CACHE_NAME = 'nowgg-proxy-v1';
const NOW_GG_DOMAINS = ['now.gg', 'nowgg.me', 'play.now.gg'];

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
                
                // Clone the request with credentials
                const proxyRequest = new Request(proxyUrl, {
                    method: event.request.method,
                    headers: event.request.headers,
                    body: event.request.method !== 'GET' && event.request.method !== 'HEAD' 
                        ? await event.request.clone().blob() 
                        : undefined,
                    credentials: 'include',
                    mode: 'cors'
                });

                const response = await fetch(proxyRequest);
                
                // Cache static assets
                if (response.ok && (url.endsWith('.js') || url.endsWith('.css') || url.endsWith('.png') || url.endsWith('.jpg'))) {
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
