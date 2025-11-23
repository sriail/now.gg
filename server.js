const express = require('express');
const http = require('http');
const https = require('https');
const url = require('url');
const path = require('path');
const cors = require('cors');

const app = express();
const PORT = process.env.PORT || 3000;

// Simple CORS middleware
app.use(cors({
  origin: '*',
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS', 'HEAD'],
  allowedHeaders: '*',
  credentials: false
}));

// Parse request bodies
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// Request logging
app.use((req, res, next) => {
  console.log(`${new Date().toISOString()} - ${req.method} ${req.url}`);
  next();
});

// Serve static files
app.use(express.static(path.join(__dirname, 'public')));

// Health check
app.get('/health', (req, res) => {
  console.log('✅ Health check - Server is running');
  res.json({
    status: 'ok',
    timestamp: new Date().toISOString(),
    server: 'simple-bare-proxy',
    uptime: process.uptime()
  });
});

// Bare server info
app.get('/bare/v1/info', (req, res) => {
  console.log('ℹ️  Bare server info requested');
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

// Simple proxy function
function simpleProxy(targetUrl, req, res) {
  console.log(`🔄 Proxying request to: ${targetUrl}`);
  console.log(`   Method: ${req.method}`);
  console.log(`   Client IP: ${req.ip || req.connection.remoteAddress}`);
  
  try {
    const parsedUrl = new URL(targetUrl);
    const isHttps = parsedUrl.protocol === 'https:';
    const httpModule = isHttps ? https : http;
    
    console.log(`   Protocol: ${parsedUrl.protocol}`);
    console.log(`   Hostname: ${parsedUrl.hostname}`);
    console.log(`   Port: ${parsedUrl.port || (isHttps ? 443 : 80)}`);
    console.log(`   Path: ${parsedUrl.pathname + parsedUrl.search}`);
    
    const options = {
      hostname: parsedUrl.hostname,
      port: parsedUrl.port || (isHttps ? 443 : 80),
      path: parsedUrl.pathname + parsedUrl.search,
      method: req.method,
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
        'Accept-Language': 'en-US,en;q=0.9',
        'Accept-Encoding': 'gzip, deflate, br',
        'Cache-Control': 'no-cache',
        'Upgrade-Insecure-Requests': '1',
        'Sec-Fetch-Dest': 'document',
        'Sec-Fetch-Mode': 'navigate',
        'Sec-Fetch-Site': 'none',
        'DNT': '1'
      }
    };

    console.log(`📡 Making ${req.method} request to ${parsedUrl.hostname}:${options.port}`);

    const proxyReq = httpModule.request(options, (proxyRes) => {
      console.log(`📥 Response status: ${proxyRes.statusCode} from ${parsedUrl.hostname}`);
      console.log(`📥 Response headers:`, Object.keys(proxyRes.headers).join(', '));
      console.log(`📥 Content-Type: ${proxyRes.headers['content-type'] || 'not specified'}`);
      console.log(`📥 Content-Length: ${proxyRes.headers['content-length'] || 'not specified'}`);
      
      // Remove problematic headers
      const headers = { ...proxyRes.headers };
      delete headers['x-frame-options'];
      delete headers['content-security-policy'];
      delete headers['content-security-policy-report-only'];
      
      // Add CORS headers
      headers['access-control-allow-origin'] = '*';
      headers['access-control-allow-methods'] = 'GET, POST, PUT, DELETE, OPTIONS, HEAD';
      headers['access-control-allow-headers'] = '*';
      
      // Set response headers
      res.writeHead(proxyRes.statusCode, headers);
      
      // Pipe the response
      proxyRes.pipe(res);
      
      // Log completion
      proxyRes.on('end', () => {
        console.log(`✅ Response completed for ${parsedUrl.hostname}`);
      });
    });

    proxyReq.on('error', (error) => {
      console.error(`❌ Proxy request error for ${targetUrl}:`, error.message);
      console.error(`   Error code: ${error.code || 'UNKNOWN'}`);
      console.error(`   Error stack:`, error.stack);
      
      if (!res.headersSent) {
        const errorMessages = {
          'ENOTFOUND': `DNS lookup failed for ${parsedUrl.hostname}. The domain may not exist or DNS is unreachable.`,
          'ECONNREFUSED': `Connection refused by ${parsedUrl.hostname}. The server may be down or blocking connections.`,
          'ETIMEDOUT': `Connection timeout to ${parsedUrl.hostname}. The server is taking too long to respond.`,
          'ECONNRESET': `Connection was reset by ${parsedUrl.hostname}. The server closed the connection.`,
          'EHOSTUNREACH': `Host ${parsedUrl.hostname} is unreachable. Network routing issue.`,
          'ENETUNREACH': `Network unreachable for ${parsedUrl.hostname}. Check your network connection.`
        };
        
        const friendlyMessage = errorMessages[error.code] || `Failed to connect to ${parsedUrl.hostname}: ${error.message}`;
        
        res.status(502).json({
          error: 'Bad Gateway',
          message: friendlyMessage,
          target: targetUrl,
          errorCode: error.code || 'UNKNOWN',
          timestamp: new Date().toISOString()
        });
      }
    });

    proxyReq.setTimeout(30000, () => {
      console.error(`⏰ Request timeout for ${targetUrl}`);
      console.error(`   Timeout threshold: 30000ms`);
      proxyReq.destroy();
      if (!res.headersSent) {
        res.status(504).json({
          error: 'Gateway Timeout',
          message: `Request to ${parsedUrl.hostname} took too long to complete (>30s)`,
          target: targetUrl,
          timeout: 30000,
          timestamp: new Date().toISOString()
        });
      }
    });

    // Handle request body for POST/PUT
    if (req.method !== 'GET' && req.method !== 'HEAD') {
      req.pipe(proxyReq);
    } else {
      proxyReq.end();
    }

  } catch (error) {
    console.error(`❌ Proxy setup error for ${targetUrl}:`, error.message);
    if (!res.headersSent) {
      res.status(400).json({
        error: 'Bad Request',
        message: `Invalid target URL: ${error.message}`,
        target: targetUrl
      });
    }
  }
}

// Main proxy endpoint
app.all('/bare/v1/proxy', (req, res) => {
  // Handle OPTIONS preflight request
  if (req.method === 'OPTIONS') {
    console.log('🔄 Handling CORS preflight request');
    res.header('Access-Control-Allow-Origin', '*');
    res.header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS, HEAD');
    res.header('Access-Control-Allow-Headers', '*');
    res.header('Access-Control-Max-Age', '86400');
    return res.status(204).send();
  }
  
  const targetUrl = req.query.url;
  
  if (!targetUrl) {
    console.error('❌ No target URL provided');
    return res.status(400).json({
      error: 'Bad Request',
      message: 'Missing "url" parameter',
      example: '/bare/v1/proxy?url=https://example.com'
    });
  }

  console.log(`🎯 Proxy request received for: ${targetUrl}`);
  simpleProxy(targetUrl, req, res);
});

// Test endpoint for debugging
app.get('/test', (req, res) => {
  console.log('🧪 Test endpoint hit');
  res.json({
    message: 'Server is working!',
    timestamp: new Date().toISOString(),
    testProxy: '/bare/v1/proxy?url=https://httpbin.org/get'
  });
});

// Catch-all route
app.get('*', (req, res) => {
  if (req.path !== '/' && !req.path.includes('.')) {
    console.log(`📄 Serving index.html for route: ${req.path}`);
  }
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// Error handling
app.use((err, req, res, next) => {
  console.error('💥 Server error:', err);
  if (!res.headersSent) {
    res.status(500).json({
      error: 'Internal Server Error',
      message: err.message
    });
  }
});

// Start server
const server = app.listen(PORT, () => {
  console.log('\n🚀 ====================================');
  console.log('    SIMPLE BARE PROXY SERVER STARTED');
  console.log('🚀 ====================================');
  console.log(`📍 Local:     http://localhost:${PORT}`);
  console.log(`🌐 Network:   http://0.0.0.0:${PORT}`);
  console.log(`🔧 Proxy:     /bare/v1/proxy?url={target}`);
  console.log(`💊 Health:    /health`);
  console.log(`🧪 Test:      /test`);
  console.log('====================================\n');
  
  // Test the server is working
  console.log('🧪 Running self-test...');
  setTimeout(() => {
    const testReq = http.request({
      hostname: 'localhost',
      port: PORT,
      path: '/health',
      method: 'GET'
    }, (testRes) => {
      console.log(`✅ Self-test passed: Server responding on port ${PORT}`);
    });
    
    testReq.on('error', (error) => {
      console.error(`❌ Self-test failed:`, error.message);
    });
    
    testReq.end();
  }, 1000);
});

// Graceful shutdown
process.on('SIGTERM', () => {
  console.log('🛑 Received SIGTERM, shutting down gracefully...');
  server.close(() => {
    console.log('✅ Server closed');
    process.exit(0);
  });
});

process.on('SIGINT', () => {
  console.log('\n🛑 Received SIGINT, shutting down gracefully...');
  server.close(() => {
    console.log('✅ Server closed');
    process.exit(0);
  });
});

// Handle uncaught errors
process.on('uncaughtException', (error) => {
  console.error('💥 Uncaught Exception:', error);
  process.exit(1);
});

process.on('unhandledRejection', (reason, promise) => {
  console.error('💥 Unhandled Rejection at:', promise, 'reason:', reason);
});
