const express = require('express');
const http = require('http');
const https = require('https');
const url = require('url');
const path = require('path');
const cors = require('cors');
const helmet = require('helmet');
const zlib = require('zlib');
const BareServer = require('./lib/bare-server');
const RequestHandler = require('./lib/request-handler');

const app = express();
const PORT = process.env.PORT || 3000;

// Initialize bare server
const bareServer = new BareServer();
const requestHandler = new RequestHandler(bareServer);

// Security middleware with iframe support
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      frameSrc: ["'self'", "https://now.gg", "https://*.now.gg"],
      scriptSrc: ["'self'", "'unsafe-inline'", "'unsafe-eval'"],
      styleSrc: ["'self'", "'unsafe-inline'"],
      imgSrc: ["'self'", "data:", "https:"],
      connectSrc: ["'self'", "https:", "wss:", "ws:"]
    }
  },
  crossOriginEmbedderPolicy: false,
  crossOriginResourcePolicy: false
}));

// CORS configuration for iframe embedding
app.use(cors({
  origin: true,
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS', 'HEAD'],
  allowedHeaders: ['*']
}));

// Parse JSON and URL encoded data
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// Serve static files
app.use(express.static(path.join(__dirname, 'public'), {
  setHeaders: (res, path) => {
    // Remove X-Frame-Options for static files
    res.removeHeader('X-Frame-Options');
  }
}));

// Health check endpoint
app.get('/health', (req, res) => {
  res.json({
    status: 'ok',
    timestamp: new Date().toISOString(),
    server: 'bare-proxy',
    uptime: process.uptime(),
    memory: process.memoryUsage()
  });
});

// Bare server endpoints for direct proxying
app.use('/bare/v1', (req, res, next) => {
  requestHandler.handleBareRequest(req, res, next);
});

// Legacy scramjet-style endpoint that redirects to bare
app.use('/scramjet/*', (req, res, next) => {
  const targetUrl = req.url.replace('/scramjet/', '');
  const fullUrl = targetUrl.startsWith('http') ? targetUrl : `https://now.gg/${targetUrl}`;
  
  // Redirect to bare server endpoint
  const bareUrl = `/bare/v1/proxy?url=${encodeURIComponent(fullUrl)}`;
  req.url = bareUrl;
  req.originalUrl = bareUrl;
  
  requestHandler.handleBareRequest(req, res, next);
});

// Direct proxy endpoint for now.gg
app.use('/proxy/*', (req, res, next) => {
  const targetPath = req.url.replace('/proxy', '');
  const targetUrl = `https://now.gg${targetPath}`;
  
  requestHandler.proxyRequest(targetUrl, req, res);
});

// WebSocket upgrade handling for real-time features
const server = http.createServer(app);

server.on('upgrade', (req, socket, head) => {
  if (req.url.startsWith('/bare/')) {
    bareServer.handleWebSocket(req, socket, head);
  } else {
    socket.destroy();
  }
});

// Catch-all route - serve main app
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// Error handling middleware
app.use((err, req, res, next) => {
  console.error('Server error:', err);
  
  if (!res.headersSent) {
    res.status(500).json({
      error: 'Internal server error',
      message: err.message,
      timestamp: new Date().toISOString()
    });
  }
});

// Start server
server.listen(PORT, () => {
  console.log(`Bare proxy server running on port ${PORT}`);
  console.log(`Now.gg proxy available at: http://localhost:${PORT}`);
  console.log(`Bare server endpoint: http://localhost:${PORT}/bare/v1/`);
  console.log(`Direct proxy: http://localhost:${PORT}/proxy/`);
});

// Graceful shutdown
process.on('SIGTERM', () => {
  console.log('Shutting down gracefully...');
  server.close(() => {
    process.exit(0);
  });
});

process.on('SIGINT', () => {
  console.log('Shutting down gracefully...');
  server.close(() => {
    process.exit(0);
  });
});
