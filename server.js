const express = require('express');
const http = require('http');
const https = require('https');
const path = require('path');
const cors = require('cors');
const zlib = require('zlib');
const { URL } = require('url');

const app = express();
const PORT = process.env.PORT || 3000;

// ============================================
// Rate Limiting Configuration
// ============================================
const RATE_LIMIT_WINDOW_MS = 60000; // 1 minute window
const RATE_LIMIT_MAX_REQUESTS = 100; // Max requests per window per IP
const TRUST_PROXY = process.env.TRUST_PROXY === 'true'; // Only trust proxy headers if explicitly enabled
const rateLimitStore = new Map();

// Clean up old rate limit entries every minute
setInterval(() => {
    const now = Date.now();
    for (const [ip, data] of rateLimitStore.entries()) {
        if (now - data.windowStart > RATE_LIMIT_WINDOW_MS) {
            rateLimitStore.delete(ip);
        }
    }
}, RATE_LIMIT_WINDOW_MS);

// Helper function to get client IP (works with Express req and http.IncomingMessage)
function getClientIp(req) {
    if (TRUST_PROXY) {
        return req.headers['x-forwarded-for']?.split(',')[0]?.trim() || 
               req.headers['x-real-ip'] || 
               req.connection?.remoteAddress ||
               req.socket?.remoteAddress || 
               '0.0.0.0';
    }
    return req.connection?.remoteAddress || req.socket?.remoteAddress || '0.0.0.0';
}

// Rate limiting middleware using sliding window algorithm
function rateLimiter(req, res, next) {
    const clientIp = getClientIp(req);
    const now = Date.now();
    
    if (!rateLimitStore.has(clientIp)) {
        rateLimitStore.set(clientIp, {
            windowStart: now,
            count: 1
        });
        return next();
    }
    
    const clientData = rateLimitStore.get(clientIp);
    
    // Reset window if expired
    if (now - clientData.windowStart > RATE_LIMIT_WINDOW_MS) {
        clientData.windowStart = now;
        clientData.count = 1;
        return next();
    }
    
    // Check if rate limit exceeded
    if (clientData.count >= RATE_LIMIT_MAX_REQUESTS) {
        const retryAfter = Math.ceil((clientData.windowStart + RATE_LIMIT_WINDOW_MS - now) / 1000);
        res.set('Retry-After', retryAfter.toString());
        res.set('X-RateLimit-Limit', RATE_LIMIT_MAX_REQUESTS.toString());
        res.set('X-RateLimit-Remaining', '0');
        res.set('X-RateLimit-Reset', new Date(clientData.windowStart + RATE_LIMIT_WINDOW_MS).toISOString());
        
        return res.status(429).json({
            error: 'Too Many Requests',
            message: `Rate limit exceeded. Try again in ${retryAfter} seconds.`,
            retryAfter: retryAfter
        });
    }
    
    clientData.count++;
    
    // Add rate limit headers
    res.set('X-RateLimit-Limit', RATE_LIMIT_MAX_REQUESTS.toString());
    res.set('X-RateLimit-Remaining', (RATE_LIMIT_MAX_REQUESTS - clientData.count).toString());
    res.set('X-RateLimit-Reset', new Date(clientData.windowStart + RATE_LIMIT_WINDOW_MS).toISOString());
    
    next();
}

// Rate limit check for WebSocket (returns true if allowed, false if rate limited)
function checkRateLimit(clientIp) {
    const now = Date.now();
    
    if (!rateLimitStore.has(clientIp)) {
        rateLimitStore.set(clientIp, {
            windowStart: now,
            count: 1
        });
        return true;
    }
    
    const clientData = rateLimitStore.get(clientIp);
    
    if (now - clientData.windowStart > RATE_LIMIT_WINDOW_MS) {
        clientData.windowStart = now;
        clientData.count = 1;
        return true;
    }
    
    if (clientData.count >= RATE_LIMIT_MAX_REQUESTS) {
        return false;
    }
    
    clientData.count++;
    return true;
}

// ============================================
// Now.gg Domain Configuration
// ============================================
const NOW_GG_DOMAINS = [
    'now.gg',
    'nowgg.me',
    'play.now.gg',
    'accounts.now.gg',
    'api.now.gg',
    'cdn.now.gg',
    'assets.now.gg',
    'static.now.gg',
    'roblox.com',
    'rbxcdn.com',
    'roblox.qq.com',
    'robloxlabs.com',
    'rbx.com'
];

// ============================================
// URL Rewriting Functions for Scramjet Proxying
// ============================================

// Create proxy URL for a given target URL
function createProxyUrl(targetUrl, baseUrl) {
    try {
        // Handle relative URLs
        let absoluteUrl;
        if (targetUrl.startsWith('//')) {
            absoluteUrl = 'https:' + targetUrl;
        } else if (targetUrl.startsWith('/')) {
            const base = new URL(baseUrl);
            absoluteUrl = `${base.protocol}//${base.host}${targetUrl}`;
        } else if (!targetUrl.startsWith('http://') && !targetUrl.startsWith('https://')) {
            const base = new URL(baseUrl);
            const basePath = base.pathname.substring(0, base.pathname.lastIndexOf('/') + 1);
            absoluteUrl = `${base.protocol}//${base.host}${basePath}${targetUrl}`;
        } else {
            absoluteUrl = targetUrl;
        }
        
        return `/bare/v1/proxy?url=${encodeURIComponent(absoluteUrl)}`;
    } catch (e) {
        return targetUrl; // Return original if parsing fails
    }
}

// Rewrite URLs in HTML content to go through proxy
function rewriteHtmlUrls(html, baseUrl) {
    try {
        const base = new URL(baseUrl);
        
        // Rewrite href attributes (links, stylesheets)
        html = html.replace(
            /(<(?:a|link)[^>]*\s+href\s*=\s*["'])([^"']+)(["'][^>]*>)/gi,
            (match, prefix, url, suffix) => {
                // Skip anchors, javascript:, data:, and mailto: URLs
                if (url.startsWith('#') || url.startsWith('javascript:') || 
                    url.startsWith('data:') || url.startsWith('mailto:')) {
                    return match;
                }
                const proxiedUrl = createProxyUrl(url, baseUrl);
                return prefix + proxiedUrl + suffix;
            }
        );
        
        // Rewrite src attributes (images, scripts, iframes)
        html = html.replace(
            /(<(?:img|script|iframe|source|video|audio|embed)[^>]*\s+src\s*=\s*["'])([^"']+)(["'][^>]*>)/gi,
            (match, prefix, url, suffix) => {
                // Skip data: and blob: URLs
                if (url.startsWith('data:') || url.startsWith('blob:')) {
                    return match;
                }
                const proxiedUrl = createProxyUrl(url, baseUrl);
                return prefix + proxiedUrl + suffix;
            }
        );
        
        // Rewrite srcset attributes
        html = html.replace(
            /(<(?:img|source)[^>]*\s+srcset\s*=\s*["'])([^"']+)(["'][^>]*>)/gi,
            (match, prefix, srcset, suffix) => {
                const rewrittenSrcset = srcset.split(',').map(item => {
                    const parts = item.trim().split(/\s+/);
                    if (parts[0] && !parts[0].startsWith('data:')) {
                        parts[0] = createProxyUrl(parts[0], baseUrl);
                    }
                    return parts.join(' ');
                }).join(', ');
                return prefix + rewrittenSrcset + suffix;
            }
        );
        
        // Rewrite action attributes (forms)
        html = html.replace(
            /(<form[^>]*\s+action\s*=\s*["'])([^"']+)(["'][^>]*>)/gi,
            (match, prefix, url, suffix) => {
                if (url.startsWith('javascript:')) {
                    return match;
                }
                const proxiedUrl = createProxyUrl(url, baseUrl);
                return prefix + proxiedUrl + suffix;
            }
        );
        
        // Rewrite poster attributes (video)
        html = html.replace(
            /(<video[^>]*\s+poster\s*=\s*["'])([^"']+)(["'][^>]*>)/gi,
            (match, prefix, url, suffix) => {
                const proxiedUrl = createProxyUrl(url, baseUrl);
                return prefix + proxiedUrl + suffix;
            }
        );
        
        // Rewrite URLs in inline styles
        html = html.replace(
            /url\s*\(\s*["']?([^"')]+)["']?\s*\)/gi,
            (match, url) => {
                if (url.startsWith('data:') || url.startsWith('blob:')) {
                    return match;
                }
                const proxiedUrl = createProxyUrl(url, baseUrl);
                return `url("${proxiedUrl}")`;
            }
        );
        
        // Add base tag handling - inject script to handle dynamic URL loading
        const injectedScript = `
<script>
(function() {
    try {
        // Override fetch to proxy requests
        if (window.fetch) {
            const originalFetch = window.fetch;
            window.fetch = function(url, options) {
                try {
                    if (typeof url === 'string' && (url.startsWith('http://') || url.startsWith('https://') || url.startsWith('//'))) {
                        const proxyUrl = '/bare/v1/proxy?url=' + encodeURIComponent(url.startsWith('//') ? 'https:' + url : url);
                        return originalFetch.call(this, proxyUrl, options);
                    }
                } catch (e) { /* fallback to original */ }
                return originalFetch.apply(this, arguments);
            };
        }
        
        // Override XMLHttpRequest open
        if (XMLHttpRequest && XMLHttpRequest.prototype.open) {
            const originalXHROpen = XMLHttpRequest.prototype.open;
            XMLHttpRequest.prototype.open = function(method, url, async, user, password) {
                try {
                    if (typeof url === 'string' && (url.startsWith('http://') || url.startsWith('https://') || url.startsWith('//'))) {
                        url = '/bare/v1/proxy?url=' + encodeURIComponent(url.startsWith('//') ? 'https:' + url : url);
                    }
                } catch (e) { /* fallback to original */ }
                return originalXHROpen.call(this, method, url, async, user, password);
            };
        }
        
        // Override WebSocket for real-time connections - route through proxy
        if (window.WebSocket) {
            const OriginalWebSocket = window.WebSocket;
            window.WebSocket = function(url, protocols) {
                try {
                    // Convert ws/wss URLs to use the WebSocket proxy endpoint
                    if (url.startsWith('wss://') || url.startsWith('ws://')) {
                        const wsProxyUrl = (window.location.protocol === 'https:' ? 'wss:' : 'ws:') + 
                                          '//' + window.location.host + '/bare/v1/ws?url=' + encodeURIComponent(url);
                        return new OriginalWebSocket(wsProxyUrl, protocols);
                    }
                } catch (e) { /* fallback to original */ }
                return new OriginalWebSocket(url, protocols);
            };
            window.WebSocket.prototype = OriginalWebSocket.prototype;
        }
    } catch (e) {
        // Script injection failed, continue without proxy overrides
    }
})();
</script>`;
        
        // Inject script after <head> tag
        if (html.includes('<head>')) {
            html = html.replace('<head>', '<head>' + injectedScript);
        } else if (html.includes('<head ')) {
            html = html.replace(/<head\s[^>]*>/, (match) => match + injectedScript);
        } else {
            html = injectedScript + html;
        }
        
        return html;
    } catch (e) {
        return html; // Return original if rewriting fails
    }
}

// CORS middleware
app.use(cors({
    origin: '*',
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS', 'HEAD'],
    allowedHeaders: '*',
    credentials: true
}));

// Parse request bodies
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// Serve static files
app.use(express.static(path.join(__dirname, 'public')));

// Health check
app.get('/health', (req, res) => {
    res.json({
        status: 'ok',
        timestamp: new Date().toISOString(),
        server: 'simple-bare-proxy',
        uptime: process.uptime()
    });
});

// Bare server info
app.get('/bare/v1/info', (req, res) => {
    res.json({
        server: 'simple-bare-proxy',
        version: '2.0.0',
        language: 'NodeJS',
        features: {
            rateLimiting: true,
            urlRewriting: true,
            webSocketProxy: true,
            compressionHandling: ['gzip', 'deflate', 'br']
        },
        endpoints: {
            proxy: '/bare/v1/proxy?url={target_url}',
            websocket: '/bare/v1/ws?url={target_url}',
            info: '/bare/v1/info'
        },
        rateLimit: {
            windowMs: RATE_LIMIT_WINDOW_MS,
            maxRequests: RATE_LIMIT_MAX_REQUESTS
        }
    });
});

// Proxy function optimized for now.gg and cloud gaming
function proxyRequest(targetUrl, req, res) {
    try {
        const parsedUrl = new URL(targetUrl);
        const isHttps = parsedUrl.protocol === 'https:';
        const httpModule = isHttps ? https : http;

        // Build headers - start with defaults optimized for now.gg/Roblox
        const headers = {
            'User-Agent': req.headers['user-agent'] || 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
            'Accept': req.headers['accept'] || 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8',
            'Accept-Language': req.headers['accept-language'] || 'en-US,en;q=0.9',
            'Accept-Encoding': 'gzip, deflate, br',
            'Connection': 'keep-alive',
            'Upgrade-Insecure-Requests': '1',
            'Sec-Fetch-Dest': req.headers['sec-fetch-dest'] || 'document',
            'Sec-Fetch-Mode': req.headers['sec-fetch-mode'] || 'navigate',
            'Sec-Fetch-Site': 'cross-site',
            'Sec-Fetch-User': '?1',
            'Cache-Control': req.headers['cache-control'] || 'max-age=0',
            'Host': parsedUrl.host,
            'Origin': `${parsedUrl.protocol}//${parsedUrl.host}`,
            'Referer': targetUrl
        };

        // Forward important headers from client
        const headersToForward = [
            'content-type',
            'content-length',
            'authorization',
            'x-csrf-token',
            'x-requested-with',
            'if-none-match',
            'if-modified-since',
            'range'
        ];

        for (const header of headersToForward) {
            if (req.headers[header]) {
                headers[header] = req.headers[header];
            }
        }

        // Forward cookies from client
        if (req.headers.cookie) {
            headers['Cookie'] = req.headers.cookie;
        }

        // Forward X-Proxy-Cookie header (for preserved cookies)
        if (req.headers['x-proxy-cookie']) {
            headers['Cookie'] = headers['Cookie'] 
                ? headers['Cookie'] + '; ' + req.headers['x-proxy-cookie']
                : req.headers['x-proxy-cookie'];
        }

        const options = {
            hostname: parsedUrl.hostname,
            port: parsedUrl.port || (isHttps ? 443 : 80),
            path: parsedUrl.pathname + parsedUrl.search,
            method: req.method,
            headers: headers,
            // Increase timeout for cloud gaming
            timeout: 60000
        };

        const proxyReq = httpModule.request(options, (proxyRes) => {
            const headers = { ...proxyRes.headers };

            // Remove frame-busting headers
            delete headers['x-frame-options'];
            delete headers['content-security-policy'];
            delete headers['content-security-policy-report-only'];

            // Add CORS headers
            headers['access-control-allow-origin'] = '*';
            headers['access-control-allow-methods'] = 'GET, POST, PUT, DELETE, OPTIONS, HEAD';
            headers['access-control-allow-headers'] = '*';
            headers['access-control-allow-credentials'] = 'true';
            headers['access-control-expose-headers'] = 'Set-Cookie';

            // Handle Set-Cookie headers - expose them to client
            if (proxyRes.headers['set-cookie']) {
                headers['x-proxy-set-cookie'] = JSON.stringify(proxyRes.headers['set-cookie']);
            }

            const contentType = headers['content-type'] || '';
            const contentEncoding = headers['content-encoding'] || '';

            // For HTML content, we need to modify it
            if (contentType.includes('text/html')) {
                let chunks = [];
                let decompressor = null;

                // Handle compressed content
                if (contentEncoding === 'gzip') {
                    decompressor = zlib.createGunzip();
                } else if (contentEncoding === 'deflate') {
                    decompressor = zlib.createInflate();
                } else if (contentEncoding === 'br') {
                    decompressor = zlib.createBrotliDecompress();
                }

                const collectData = (stream) => {
                    stream.on('data', chunk => chunks.push(chunk));
                    stream.on('end', () => {
                        let html = Buffer.concat(chunks).toString('utf8');
                        
                        // Remove common frame-busting patterns
                        // Pattern: if (top !== self) { top.location = self.location; }
                        html = html.replace(/if\s*\(\s*top\s*!==?\s*self\s*\)\s*\{\s*top\.location\s*=\s*[^;]+;\s*\}/gi, '');
                        // Pattern: if (window !== top) { ... }
                        html = html.replace(/if\s*\(\s*window\s*!==?\s*top\s*\)\s*\{\s*[^}]*\}/gi, '');
                        // Pattern: top.location = self.location (standalone)
                        html = html.replace(/top\.location\s*=\s*self\.location\s*;?/gi, '');
                        // Pattern: top.location.href = ... (redirect)
                        html = html.replace(/top\.location\.href\s*=\s*[^;]+;/gi, '');

                        // Rewrite all URLs to go through proxy (Scramjet-style)
                        html = rewriteHtmlUrls(html, targetUrl);

                        // Remove content-encoding since we decompressed
                        delete headers['content-encoding'];
                        delete headers['content-length'];

                        res.writeHead(proxyRes.statusCode, headers);
                        res.end(html);
                    });
                    stream.on('error', () => {
                        res.writeHead(proxyRes.statusCode, headers);
                        proxyRes.pipe(res);
                    });
                };

                if (decompressor) {
                    proxyRes.pipe(decompressor);
                    collectData(decompressor);
                } else {
                    collectData(proxyRes);
                }
            } else if (contentType.includes('text/css') || contentType.includes('application/javascript') || contentType.includes('text/javascript')) {
                // Handle CSS and JS content - rewrite URLs
                let chunks = [];
                let decompressor = null;

                if (contentEncoding === 'gzip') {
                    decompressor = zlib.createGunzip();
                } else if (contentEncoding === 'deflate') {
                    decompressor = zlib.createInflate();
                } else if (contentEncoding === 'br') {
                    decompressor = zlib.createBrotliDecompress();
                }

                const collectCssJs = (stream) => {
                    stream.on('data', chunk => chunks.push(chunk));
                    stream.on('end', () => {
                        let content = Buffer.concat(chunks).toString('utf8');
                        
                        // Rewrite URLs in CSS/JS
                        content = content.replace(
                            /url\s*\(\s*["']?([^"')]+)["']?\s*\)/gi,
                            (match, url) => {
                                if (url.startsWith('data:') || url.startsWith('blob:')) {
                                    return match;
                                }
                                const proxiedUrl = createProxyUrl(url, targetUrl);
                                return `url("${proxiedUrl}")`;
                            }
                        );

                        delete headers['content-encoding'];
                        delete headers['content-length'];

                        res.writeHead(proxyRes.statusCode, headers);
                        res.end(content);
                    });
                    stream.on('error', () => {
                        res.writeHead(proxyRes.statusCode, headers);
                        proxyRes.pipe(res);
                    });
                };

                if (decompressor) {
                    proxyRes.pipe(decompressor);
                    collectCssJs(decompressor);
                } else {
                    collectCssJs(proxyRes);
                }
            } else {
                // For other content types, stream directly
                res.writeHead(proxyRes.statusCode, headers);
                proxyRes.pipe(res);
            }
        });

        proxyReq.on('error', (error) => {
            if (!res.headersSent) {
                res.status(502).json({
                    error: 'Bad Gateway',
                    message: `Failed to connect: ${error.message}`,
                    target: targetUrl
                });
            }
        });

        proxyReq.setTimeout(60000, () => {
            proxyReq.destroy();
            if (!res.headersSent) {
                res.status(504).json({
                    error: 'Gateway Timeout',
                    message: 'Request timed out',
                    target: targetUrl
                });
            }
        });

        if (req.method !== 'GET' && req.method !== 'HEAD') {
            req.pipe(proxyReq);
        } else {
            proxyReq.end();
        }

    } catch (error) {
        if (!res.headersSent) {
            res.status(400).json({
                error: 'Bad Request',
                message: `Invalid URL: ${error.message}`,
                target: targetUrl
            });
        }
    }
}

// Main proxy endpoint with rate limiting
app.all('/bare/v1/proxy', rateLimiter, (req, res) => {
    if (req.method === 'OPTIONS') {
        res.header('Access-Control-Allow-Origin', '*');
        res.header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS, HEAD');
        res.header('Access-Control-Allow-Headers', '*');
        res.header('Access-Control-Max-Age', '86400');
        return res.status(204).send();
    }

    const targetUrl = req.query.url;

    if (!targetUrl) {
        return res.status(400).json({
            error: 'Bad Request',
            message: 'Missing "url" parameter',
            example: '/bare/v1/proxy?url=https://now.gg'
        });
    }

    proxyRequest(targetUrl, req, res);
});

// Test endpoint
app.get('/test', (req, res) => {
    res.json({
        message: 'Server is working!',
        timestamp: new Date().toISOString()
    });
});

// Catch-all route
app.get('*', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// Error handling
app.use((err, req, res, next) => {
    if (!res.headersSent) {
        res.status(500).json({
            error: 'Internal Server Error',
            message: err.message
        });
    }
});

// Start server
const server = app.listen(PORT, () => {
    console.log(`Server running on http://localhost:${PORT}`);
});

// ============================================
// WebSocket Proxy Support for Real-time Gaming
// ============================================
server.on('upgrade', (req, socket, head) => {
    // Apply rate limiting to WebSocket connections
    const clientIp = getClientIp(req);
    if (!checkRateLimit(clientIp)) {
        socket.write('HTTP/1.1 429 Too Many Requests\r\n\r\n');
        socket.destroy();
        return;
    }

    const targetUrl = new URL(req.url, `http://${req.headers.host}`).searchParams.get('url');
    
    if (!targetUrl || !req.url.startsWith('/bare/v1/ws')) {
        socket.write('HTTP/1.1 400 Bad Request\r\n\r\n');
        socket.destroy();
        return;
    }

    try {
        const parsedUrl = new URL(targetUrl);
        const isSecure = parsedUrl.protocol === 'wss:' || parsedUrl.protocol === 'https:';
        const httpModule = isSecure ? https : http;
        
        const proxyReq = httpModule.request({
            hostname: parsedUrl.hostname,
            port: parsedUrl.port || (isSecure ? 443 : 80),
            path: parsedUrl.pathname + parsedUrl.search,
            method: 'GET',
            headers: {
                ...req.headers,
                host: parsedUrl.host,
                'Connection': 'Upgrade',
                'Upgrade': 'websocket'
            }
        });

        proxyReq.on('upgrade', (proxyRes, proxySocket, proxyHead) => {
            socket.write('HTTP/1.1 101 Switching Protocols\r\n' +
                        'Upgrade: websocket\r\n' +
                        'Connection: Upgrade\r\n' +
                        `Sec-WebSocket-Accept: ${proxyRes.headers['sec-websocket-accept']}\r\n` +
                        '\r\n');

            // Write any head data from the client to the proxy
            if (head && head.length > 0) {
                proxySocket.write(head);
            }
            // Write any head data from the proxy to the client
            if (proxyHead && proxyHead.length > 0) {
                socket.write(proxyHead);
            }
            
            proxySocket.pipe(socket);
            socket.pipe(proxySocket);

            socket.on('error', () => proxySocket.destroy());
            proxySocket.on('error', () => socket.destroy());
        });

        proxyReq.on('error', () => {
            socket.write('HTTP/1.1 502 Bad Gateway\r\n\r\n');
            socket.destroy();
        });

        proxyReq.end();
    } catch (error) {
        socket.write('HTTP/1.1 400 Bad Request\r\n\r\n');
        socket.destroy();
    }
});

// Graceful shutdown
process.on('SIGTERM', () => {
    server.close(() => process.exit(0));
});

process.on('SIGINT', () => {
    server.close(() => process.exit(0));
});
