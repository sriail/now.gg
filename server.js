const express = require('express');
const http = require('http');
const https = require('https');
const path = require('path');
const cors = require('cors');
const zlib = require('zlib');

const app = express();
const PORT = process.env.PORT || 3000;

// CORS middleware
app.use(cors({
    origin: '*',
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS', 'HEAD'],
    allowedHeaders: '*',
    credentials: true
}));

// Parse request bodies
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));

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
        version: '1.0.0',
        language: 'NodeJS',
        endpoints: {
            proxy: '/bare/v1/proxy?url={target_url}',
            info: '/bare/v1/info'
        }
    });
});

// Proxy function optimized for now.gg
function proxyRequest(targetUrl, req, res) {
    try {
        const parsedUrl = new URL(targetUrl);
        const isHttps = parsedUrl.protocol === 'https:';
        const httpModule = isHttps ? https : http;

        const options = {
            hostname: parsedUrl.hostname,
            port: parsedUrl.port || (isHttps ? 443 : 80),
            path: parsedUrl.pathname + parsedUrl.search,
            method: req.method,
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
                'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8',
                'Accept-Language': 'en-US,en;q=0.9',
                'Accept-Encoding': 'gzip, deflate, br',
                'Connection': 'keep-alive',
                'Upgrade-Insecure-Requests': '1',
                'Sec-Fetch-Dest': 'document',
                'Sec-Fetch-Mode': 'navigate',
                'Sec-Fetch-Site': 'none',
                'Sec-Fetch-User': '?1',
                'Cache-Control': 'max-age=0'
            }
        };

        // Forward cookies from client
        if (req.headers.cookie) {
            options.headers['Cookie'] = req.headers.cookie;
        }

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
                        
                        // Remove frame-busting JavaScript
                        html = html.replace(/if\s*\(\s*top\s*!==?\s*self\s*\)[^}]*\}/gi, '');
                        html = html.replace(/if\s*\(\s*window\s*!==?\s*top\s*\)[^}]*\}/gi, '');
                        html = html.replace(/if\s*\(\s*parent\s*!==?\s*window\s*\)[^}]*\}/gi, '');
                        html = html.replace(/top\.location\s*=\s*self\.location/gi, '');
                        html = html.replace(/top\.location\.href\s*=/gi, '// ');

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
            } else {
                // For non-HTML content, stream directly
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

        proxyReq.setTimeout(30000, () => {
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

// Main proxy endpoint
app.all('/bare/v1/proxy', (req, res) => {
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

// Graceful shutdown
process.on('SIGTERM', () => {
    server.close(() => process.exit(0));
});

process.on('SIGINT', () => {
    server.close(() => process.exit(0));
});
