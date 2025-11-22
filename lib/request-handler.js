const url = require('url');

class RequestHandler {
  constructor(bareServer) {
    this.bareServer = bareServer;
  }

  async handleBareRequest(req, res, next) {
    try {
      // Parse the request URL
      const parsedUrl = url.parse(req.url, true);
      const path = parsedUrl.pathname;

      if (path === '/bare/v1/proxy') {
        await this.handleProxyRequest(req, res);
      } else if (path === '/bare/v1/ws') {
        await this.handleWebSocketRequest(req, res);
      } else if (path === '/bare/v1/info') {
        this.handleInfoRequest(req, res);
      } else {
        res.status(404).json({ error: 'Endpoint not found' });
      }
    } catch (error) {
      console.error('Request handler error:', error);
      if (!res.headersSent) {
        res.status(500).json({
          error: 'Internal server error',
          message: error.message
        });
      }
    }
  }

  async handleProxyRequest(req, res) {
    const parsedUrl = url.parse(req.url, true);
    const targetUrl = parsedUrl.query.url;

    if (!targetUrl) {
      return res.status(400).json({
        error: 'Missing target URL',
        message: 'Please provide a target URL in the "url" query parameter'
      });
    }

    // Validate URL
    try {
      new URL(targetUrl);
    } catch (error) {
      return res.status(400).json({
        error: 'Invalid URL',
        message: 'The provided URL is not valid'
      });
    }

    console.log(`Proxying request to: ${targetUrl}`);

    try {
      await this.bareServer.proxyRequest(targetUrl, req, res);
    } catch (error) {
      console.error('Proxy request failed:', error);
      if (!res.headersSent) {
        res.status(502).json({
          error: 'Proxy request failed',
          message: error.message
        });
      }
    }
  }

  async handleWebSocketRequest(req, res) {
    res.status(501).json({
      error: 'WebSocket not implemented',
      message: 'WebSocket proxying is not yet implemented'
    });
  }

  handleInfoRequest(req, res) {
    res.json({
      server: 'bare-server',
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
  }

  async proxyRequest(targetUrl, req, res) {
    return this.bareServer.proxyRequest(targetUrl, req, res);
  }
}

module.exports = RequestHandler;
