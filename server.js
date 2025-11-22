const express = require('express');
const { createProxyMiddleware } = require('http-proxy-middleware');
const cors = require('cors');
const helmet = require('helmet');
const path = require('path');
const ProxyHandler = require('./lib/proxy-handler');
const IPRotator = require('./lib/ip-rotator');

const app = express();
const PORT = process.env.PORT || 3000;

// Security middleware
app.use(helmet({
  contentSecurityPolicy: false, // Disable for iframe functionality
  crossOriginEmbedderPolicy: false
}));

// CORS configuration
app.use(cors({
  origin: '*',
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With']
}));

// Initialize IP rotator and proxy handler
const ipRotator = new IPRotator();
const proxyHandler = new ProxyHandler(ipRotator);

// Serve static files
app.use(express.static(path.join(__dirname, 'public')));

// Health check endpoint
app.get('/health', (req, res) => {
  res.json({ 
    status: 'ok', 
    timestamp: new Date().toISOString(),
    activeProxies: ipRotator.getActiveProxyCount()
  });
});

// Scramjet proxy endpoint
app.use('/scramjet/*', createProxyMiddleware({
  target: 'https://now.gg',
  changeOrigin: true,
  pathRewrite: {
    '^/scramjet': ''
  },
  onProxyReq: (proxyReq, req, res) => {
    // Add custom headers
    proxyReq.setHeader('User-Agent', 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36');
    proxyReq.setHeader('Accept', 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8');
    
    // Use rotating IP if available
    const currentProxy = ipRotator.getCurrentProxy();
    if (currentProxy) {
      console.log(`Using proxy: ${currentProxy.host}:${currentProxy.port}`);
    }
  },
  onError: (err, req, res) => {
    console.error('Proxy error:', err);
    ipRotator.markProxyAsFailed();
    res.status(500).json({ error: 'Proxy connection failed' });
  }
}));

// Main proxy route for now.gg
app.use('/proxy/*', (req, res, next) => {
  proxyHandler.handleRequest(req, res, next);
});

// Catch-all route
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// Start server
app.listen(PORT, () => {
  console.log(`Now.gg proxy server running on port ${PORT}`);
  console.log(`Access the proxy at: http://localhost:${PORT}`);
  
  // Initialize IP rotation
  ipRotator.startRotation();
});

// Graceful shutdown
process.on('SIGTERM', () => {
  console.log('Shutting down gracefully...');
  ipRotator.stopRotation();
  process.exit(0);
});
