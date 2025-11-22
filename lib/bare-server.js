const http = require('http');
const https = require('https');
const url = require('url');
const zlib = require('zlib');
const crypto = require('crypto');

class BareServer {
  constructor() {
    this.sessions = new Map();
    this.userAgents = [
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:109.0) Gecko/20100101 Firefox/121.0'
    ];
  }

  generateSessionId() {
    return crypto.randomBytes(16).toString('hex');
  }

  getRandomUserAgent() {
    return this.userAgents[Math.floor(Math.random() * this.userAgents.length)];
  }

  async proxyRequest(targetUrl, originalReq, originalRes) {
    try {
      const parsedUrl = new URL(targetUrl);
      const isHttps = parsedUrl.protocol === 'https:';
      const httpModule = isHttps ? https : http;

      const options = {
        hostname: parsedUrl.hostname,
        port: parsedUrl.port || (isHttps ? 443 : 80),
        path: parsedUrl.pathname + parsedUrl.search,
        method: originalReq.method,
        headers: this.sanitizeRequestHeaders(originalReq.headers, parsedUrl.hostname)
      };

      return new Promise((resolve, reject) => {
        const proxyReq = httpModule.request(options, (proxyRes) => {
          this.handleProxyResponse(proxyRes, originalReq, originalRes, targetUrl);
          resolve(proxyRes);
        });

        proxyReq.on('error', (error) => {
          console.error('Proxy request error:', error);
          this.sendErrorResponse(originalRes, 502, 'Bad Gateway', error.message);
          reject(error);
        });

        proxyReq.setTimeout(30000, () => {
          proxyReq.destroy();
          this.sendErrorResponse(originalRes, 504, 'Gateway Timeout', 'Request timeout');
          reject(new Error('Request timeout'));
        });

        // Forward request body for POST/PUT requests
        if (originalReq.method !== 'GET' && originalReq.method !== 'HEAD') {
          originalReq.pipe(proxyReq);
        } else {
          proxyReq.end();
        }
      });
    } catch (error) {
      console.error('Proxy error:', error);
      this.sendErrorResponse(originalRes, 500, 'Internal Server Error', error.message);
      throw error;
    }
  }

  sanitizeRequestHeaders(headers, targetHost) {
    const sanitized = { ...headers };

    // Set proper host
    sanitized.host = targetHost;

    // Set random user agent for stealth
    sanitized['user-agent'] = this.getRandomUserAgent();

    // Remove proxy-specific headers
    delete sanitized['x-forwarded-for'];
    delete sanitized['x-forwarded-proto'];
    delete sanitized['x-forwarded-host'];
    delete sanitized['x-real-ip'];
    delete sanitized['cf-connecting-ip'];

    // Remove potential tracking headers
    delete sanitized['x-forwarded-user-agent'];
    delete sanitized['x-original-forwarded-for'];

    // Set standard headers for stealth
    sanitized.accept = sanitized.accept || 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8';
    sanitized['accept-language'] = sanitized['accept-language'] || 'en-US,en;q=0.9';
    sanitized['accept-encoding'] = 'gzip, deflate, br';
    sanitized['cache-control'] = 'no-cache';
    sanitized['upgrade-insecure-requests'] = '1';

    // Add DNT (Do Not Track) header
    sanitized.dnt = '1';

    return sanitized;
  }

  handleProxyResponse(proxyRes, originalReq, originalRes, targetUrl) {
    // Sanitize response headers
    const headers = this.sanitizeResponseHeaders(proxyRes.headers);

    // Set status code
    originalRes.statusCode = proxyRes.statusCode;

    // Set headers
    Object.keys(headers).forEach(key => {
      originalRes.setHeader(key, headers[key]);
    });

    // Handle content encoding
    const encoding = proxyRes.headers['content-encoding'];
    let responseStream = proxyRes;

    if (encoding === 'gzip') {
      responseStream = proxyRes.pipe(zlib.createGunzip());
    } else if (encoding === 'deflate') {
      responseStream = proxyRes.pipe(zlib.createInflate());
    } else if (encoding === 'br') {
      responseStream = proxyRes.pipe(zlib.createBrotliDecompress());
    }

    // Modify content if it's HTML/JS/CSS
    const contentType = proxyRes.headers['content-type'] || '';
    
    if (this.shouldModifyContent(contentType)) {
      this.modifyContent(responseStream, originalRes, contentType, targetUrl);
    } else {
      // Pipe response directly
      responseStream.pipe(originalRes);
    }
  }

  sanitizeResponseHeaders(headers) {
    const sanitized = { ...headers };

    // Remove frame-busting headers
    delete sanitized['x-frame-options'];
    delete sanitized['content-security-policy'];
    delete sanitized['content-security-policy-report-only'];

    // Set CORS headers
    sanitized['access-control-allow-origin'] = '*';
    sanitized['access-control-allow-methods'] = 'GET, POST, PUT, DELETE, OPTIONS, HEAD';
    sanitized['access-control-allow-headers'] = '*';
    sanitized['access-control-allow-credentials'] = 'true';

    // Remove tracking headers
    delete sanitized['x-powered-by'];
    delete sanitized['server'];

    // Handle cookies for cross-origin
    if (sanitized['set-cookie']) {
      sanitized['set-cookie'] = Array.isArray(sanitized['set-cookie']) 
        ? sanitized['set-cookie'].map(cookie => cookie.replace(/;\s*secure/gi, '').replace(/;\s*samesite=[^;]*/gi, '; SameSite=None'))
        : sanitized['set-cookie'].replace(/;\s*secure/gi, '').replace(/;\s*samesite=[^;]*/gi, '; SameSite=None');
    }

    return sanitized;
  }

  shouldModifyContent(contentType) {
    return contentType.includes('text/html') || 
           contentType.includes('application/javascript') || 
           contentType.includes('text/javascript') || 
           contentType.includes('text/css');
  }

  modifyContent(stream, res, contentType, targetUrl) {
    let body = '';
    
    stream.on('data', chunk => {
      body += chunk.toString();
    });

    stream.on('end', () => {
      let modifiedContent = body;

      try {
        if (contentType.includes('text/html')) {
          modifiedContent = this.modifyHTML(body, targetUrl);
        } else if (contentType.includes('javascript')) {
          modifiedContent = this.modifyJS(body);
        } else if (contentType.includes('text/css')) {
          modifiedContent = this.modifyCSS(body, targetUrl);
        }
      } catch (error) {
        console.error('Content modification error:', error);
        modifiedContent = body; // Fallback to original content
      }

      // Update content length
      res.setHeader('content-length', Buffer.byteLength(modifiedContent, 'utf8'));
      res.end(modifiedContent);
    });

    stream.on('error', (error) => {
      console.error('Stream error:', error);
      res.statusCode = 500;
      res.end('Error processing content');
    });
  }

  modifyHTML(html, targetUrl) {
    const baseUrl = new URL(targetUrl).origin;
    
    // Inject bare client script
    const bareClientScript = `
      <script>
        // Bare client initialization
        window.__BARE__ = {
          origin: '${process.env.BARE_ORIGIN || 'http://localhost:3000'}',
          prefix: '/bare/v1/',
          rewriteUrl: function(url) {
            if (url.startsWith('http')) {
              return window.__BARE__.origin + '/bare/v1/proxy?url=' + encodeURIComponent(url);
            } else if (url.startsWith('/')) {
              return window.__BARE__.origin + '/bare/v1/proxy?url=' + encodeURIComponent('${baseUrl}' + url);
            }
            return url;
          }
        };

        // Override fetch API
        const originalFetch = window.fetch;
        window.fetch = function(input, init = {}) {
          let url = typeof input === 'string' ? input : input.url;
          
          if (url.startsWith('/') || url.startsWith('http')) {
            url = window.__BARE__.rewriteUrl(url);
          }
          
          const newInit = {
            ...init,
            headers: {
              ...init.headers,
              'X-Bare-Headers': JSON.stringify(init.headers || {})
            }
          };
          
          return originalFetch(url, newInit);
        };

        // Override XMLHttpRequest
        const originalXHR = XMLHttpRequest.prototype.open;
        XMLHttpRequest.prototype.open = function(method, url, async, user, password) {
          if (url.startsWith('/') || url.startsWith('http')) {
            url = window.__BARE__.rewriteUrl(url);
          }
          return originalXHR.call(this, method, url, async, user, password);
        };

        // Override WebSocket
        const originalWS = window.WebSocket;
        window.WebSocket = function(url, protocols) {
          if (url.startsWith('ws://') || url.startsWith('wss://')) {
            url = url.replace('ws://', 'ws://localhost:3000/bare/v1/ws?url=ws://');
            url = url.replace('wss://', 'ws://localhost:3000/bare/v1/ws?url=wss://');
          }
          return new originalWS(url, protocols);
        };

        // Disable frame busting
        Object.defineProperty(window, 'top', {
          get: function() { return window; }
        });
        
        Object.defineProperty(window, 'parent', {
          get: function() { return window; }
        });
      </script>
    `;

    // Inject script before closing head tag
    html = html.replace(/<\/head>/i, bareClientScript + '</head>');

    // Rewrite URLs in HTML attributes
    html = html.replace(/href=["']([^"']+)["']/g, (match, url) => {
      if (url.startsWith('http') || url.startsWith('/')) {
        const rewrittenUrl = this.rewriteUrl(url, baseUrl);
        return `href="${rewrittenUrl}"`;
      }
      return match;
    });

    html = html.replace(/src=["']([^"']+)["']/g, (match, url) => {
      if (url.startsWith('http') || url.startsWith('/')) {
        const rewrittenUrl = this.rewriteUrl(url, baseUrl);
        return `src="${rewrittenUrl}"`;
      }
      return match;
    });

    // Remove frame-busting scripts
    html = html.replace(/if\s*\(\s*top\s*!==?\s*self\s*\)[^}]*}/gi, '');
    html = html.replace(/if\s*\(\s*window\s*!==?\s*top\s*\)[^}]*}/gi, '');
    html = html.replace(/top\.location\s*=\s*[^;]+;?/gi, '');

    return html;
  }

  modifyJS(js) {
    // Disable frame-busting
    js = js.replace(/top\.location\s*=\s*[^;]+/g, '// disabled frame buster');
    js = js.replace(/window\.top\.location\s*=\s*[^;]+/g, '// disabled frame buster');
    js = js.replace(/if\s*\(\s*top\s*!==?\s*self\s*\)/g, 'if (false)');
    js = js.replace(/if\s*\(\s*window\s*!==?\s*top\s*\)/g, 'if (false)');

    // Override location access
    js = js.replace(/top\.location/g, 'window.location');
    js = js.replace(/parent\.location/g, 'window.location');

    return js;
  }

  modifyCSS(css, targetUrl) {
    const baseUrl = new URL(targetUrl).origin;
    
    // Rewrite URL references in CSS
    css = css.replace(/url\(["']?([^"')]+)["']?\)/g, (match, url) => {
      if (url.startsWith('http') || url.startsWith('/')) {
        const rewrittenUrl = this.rewriteUrl(url, baseUrl);
        return `url("${rewrittenUrl}")`;
      }
      return match;
    });

    return css;
  }

  rewriteUrl(url, baseUrl) {
    const baseOrigin = process.env.BARE_ORIGIN || 'http://localhost:3000';
    
    if (url.startsWith('http')) {
      return `${baseOrigin}/bare/v1/proxy?url=${encodeURIComponent(url)}`;
    } else if (url.startsWith('/')) {
      return `${baseOrigin}/bare/v1/proxy?url=${encodeURIComponent(baseUrl + url)}`;
    }
    
    return url;
  }

  handleWebSocket(req, socket, head) {
    // WebSocket proxy handling
    const urlParams = new URLSearchParams(req.url.split('?')[1]);
    const targetWsUrl = urlParams.get('url');
    
    if (!targetWsUrl) {
      socket.destroy();
      return;
    }

    console.log('WebSocket proxy request to:', targetWsUrl);
    
    // TODO: Implement WebSocket proxying
    // This would require additional WebSocket proxy logic
    socket.destroy();
  }

  sendErrorResponse(res, statusCode, statusMessage, errorMessage) {
    if (!res.headersSent) {
      res.statusCode = statusCode;
      res.statusMessage = statusMessage;
      res.setHeader('Content-Type', 'application/json');
      res.end(JSON.stringify({
        error: statusMessage,
        message: errorMessage,
        timestamp: new Date().toISOString()
      }));
    }
  }
}

module.exports = BareServer;
