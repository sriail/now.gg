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
      frameSrc: ["'self'", "*"],
      scriptSrc: ["'self'", "'unsafe-inline'", "'unsafe-eval'"],
      styleSrc: ["'self'", "'unsafe-inline'"],
      imgSrc: ["'self'", "data:", "*"],
      connectSrc: ["'self'", "*"]
    }
  },
  crossOriginEmbedderPolicy: false,
  crossOriginResourcePolicy: false
}));

// Enhanced CORS configuration
app.use(cors({
  origin: true,
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS', 'HEAD'],
  allowedHeaders: ['*'],
  exposedHeaders: ['*']
}));

// Parse JSON and URL encoded data
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// Logging middleware
app.use((req, res, next) => {
  console.log(`${new Date().toISOString()} - ${req.method} ${req.url}`);
  next();
});

// Serve static files
app.use(express.static(path.join(__dirname, 'public'), {
  setHeaders: (res, path) => {
    res.removeHeader('X-Frame-Options');
  }
}));

// Health check endpoint
app.get('/health', (req, res) => {
  console.log('Health check requested');
  res.json({
    status: 'ok',
    timestamp: new Date().toISOString(),
    server: 'bare-proxy',
    uptime: process.uptime(),
    memory: process.memoryUsage(),
    endpoints: {
      proxy: '/bare/v1/proxy?url={target_url}',
      info: '/bare/v1/info',
      health: '/health'
    }
  });
});

// Bare server info endpoint
app.get('/bare/v1/info', (req, res) => {
  console.log('Bare server info requested');
  res.json({
    server: 'bare-server-node',
    version: '1.0.0',
    language: 'NodeJS',
    memoryUsage: process.memoryUsage(),
    uptime: process.uptime(),
    endpoints: {
      proxy: '/bare/v1/proxy?url={target_url}',
      websocket: '/bare/v1/ws?url={target_ws_url}',
      info: '/bare/v1/info'
    },
    features: [
      'HTTP/HTTPS proxy',
      'Content rewriting',
      'Header sanitization',
      'Frame-bust prevention',
      'CORS handling'
    ]
  });
});

// Main bare proxy endpoint
app.all('/bare/v1/proxy', async (req, res) => {
  try {
    console.log('Bare proxy request:', req.method, req.query.url);
    await requestHandler.handleBareRequest(req, res);
  } catch (error) {
    console.error('Bare proxy error:', error);
    if (!res.headersSent) {
      res.status(500).json({
        error: 'Proxy request failed',
        message: error.message
      });
    }
  }
});

// Legacy endpoints for compatibility
app.use('/scramjet/*', (req, res) => {
  const targetUrl = req.url.replace('/scramjet/', '');
  const fullUrl = targetUrl.startsWith('http') ? targetUrl : `https://now.gg/${targetUrl}`;
  
  console.log('Legacy scramjet request redirecting to:', fullUrl);
  
  // Redirect to bare proxy
  const redirectUrl = `/bare/v1/proxy?url=${encodeURIComponent(fullUrl)}`;
  res.redirect(302, redirectUrl);
});

app.use('/proxy/*', (req, res) => {
  const targetPath = req.url.replace('/proxy', '');
  const targetUrl = `https://now.gg${targetPath}`;
  
  console.log('Legacy proxy request redirecting to:', targetUrl);
  
  // Redirect to bare proxy
  const redirectUrl = `/bare/v1/proxy?url=${encodeURIComponent(targetUrl)}`;
  res.redirect(302, redirectUrl);
});

// Create HTTP server
const server = http.createServer(app);

// WebSocket upgrade handling (placeholder)
server.on('upgrade', (req, socket, head) => {
  console.log('WebSocket upgrade request:', req.url);
  if (req.url.startsWith('/bare/v1/ws')) {
    // TODO: Implement WebSocket proxying
    socket.write('HTTP/1.1 501 Not Implemented\r\n\r\n');
    socket.end();
  } else {
    socket.destroy();
  }
});

// Catch-all route - serve main app
app.get('*', (req, res) => {
  console.log('Serving main app for:', req.url);
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
  console.log(`=================================`);
  console.log(`🚀 Bare Proxy Server Started`);
  console.log(`📡 Port: ${PORT}`);
  console.log(`🌐 URL: http://localhost:${PORT}`);
  console.log(`🔧 Proxy: /bare/v1/proxy?url={target}`);
  console.log(`💡 Health: /health`);
  console.log(`📊 Info: /bare/v1/info`);
  console.log(`=================================`);
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

// Handle uncaught exceptions
process.on('uncaughtException', (error) => {
  console.error('Uncaught Exception:', error);
  process.exit(1);
});

process.on('unhandledRejection', (reason, promise) => {
  console.error('Unhandled Rejection at:', promise, 'reason:', reason);
});
