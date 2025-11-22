const { createProxyMiddleware } = require('http-proxy-middleware');
const url = require('url');

class ProxyHandler {
  constructor(ipRotator) {
    this.ipRotator = ipRotator;
    this.scramjetEnabled = true;
  }

  handleRequest(req, res, next) {
    const targetUrl = req.url.replace('/proxy/', '');
    const fullUrl = targetUrl.startsWith('http') ? targetUrl : `https://now.gg${targetUrl}`;
    
    console.log(`Proxying request to: ${fullUrl}`);

    // Create dynamic proxy middleware
    const proxy = createProxyMiddleware({
      target: 'https://now.gg',
      changeOrigin: true,
      pathRewrite: {
        '^/proxy': ''
      },
      onProxyReq: (proxyReq, req, res) => {
        this.modifyProxyRequest(proxyReq, req);
      },
      onProxyRes: (proxyRes, req, res) => {
        this.modifyProxyResponse(proxyRes, req, res);
      },
      onError: (err, req, res) => {
        this.handleProxyError(err, req, res);
      }
    });

    proxy(req, res, next);
  }

  modifyProxyRequest(proxyReq, req) {
    // Set headers for stealth
    proxyReq.setHeader('User-Agent', this.getRandomUserAgent());
    proxyReq.setHeader('Accept', 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8');
    proxyReq.setHeader('Accept-Language', 'en-US,en;q=0.9');
    proxyReq.setHeader('Accept-Encoding', 'gzip, deflate, br');
    proxyReq.setHeader('Cache-Control', 'no-cache');
    proxyReq.setHeader('Pragma', 'no-cache');
    
    // Remove potentially problematic headers
    proxyReq.removeHeader('x-forwarded-for');
    proxyReq.removeHeader('x-real-ip');
    
    // Apply current proxy if available
    const currentProxy = this.ipRotator.getCurrentProxy();
    if (currentProxy && currentProxy.auth) {
      proxyReq.setHeader('Proxy-Authorization', `Basic ${currentProxy.auth}`);
    }
  }

  modifyProxyResponse(proxyRes, req, res) {
    // Add CORS headers
    proxyRes.headers['access-control-allow-origin'] = '*';
    proxyRes.headers['access-control-allow-methods'] = 'GET, POST, PUT, DELETE, OPTIONS';
    proxyRes.headers['access-control-allow-headers'] = '*';
    
    // Remove frame busting headers
    delete proxyRes.headers['x-frame-options'];
    delete proxyRes.headers['content-security-policy'];
    
    // Modify content if it's HTML for Scramjet integration
    if (proxyRes.headers['content-type'] && 
        proxyRes.headers['content-type'].includes('text/html')) {
      this.injectScramjetScript(proxyRes);
    }
  }

  handleProxyError(err, req, res) {
    console.error('Proxy error:', err.message);
    
    // Mark current proxy as failed and rotate
    this.ipRotator.markProxyAsFailed();
    
    // Send error response
    if (!res.headersSent) {
      res.status(502).json({
        error: 'Proxy connection failed',
        message: err.message,
        timestamp: new Date().toISOString()
      });
    }
  }

  injectScramjetScript(proxyRes) {
    // Scramjet injection logic would go here
    // This is a placeholder for the actual Scramjet integration
    const scramjetScript = `
      <script>
        // Scramjet URL rewriting and proxy logic
        window.scramjetConfig = {
          prefix: '/scramjet/',
          origin: window.location.origin
        };
      </script>
    `;
    
    // Note: Actual HTML modification would require streaming and parsing
    console.log('Scramjet script injection placeholder');
  }

  getRandomUserAgent() {
    const userAgents = [
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:109.0) Gecko/20100101 Firefox/121.0'
    ];
    
    return userAgents[Math.floor(Math.random() * userAgents.length)];
  }
}

module.exports = ProxyHandler;
