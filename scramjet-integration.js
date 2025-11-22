// Scramjet integration module for advanced web proxy features
class ScramjetIntegration {
  constructor() {
    this.rewriteRules = new Map();
    this.contentModifiers = new Map();
    this.initializeDefaultRules();
  }

  initializeDefaultRules() {
    // URL rewrite rules for now.gg
    this.rewriteRules.set('now.gg', {
      baseUrl: 'https://now.gg',
      rules: [
        {
          pattern: /\/games\/([^\/]+)/g,
          replacement: '/scramjet/games/$1'
        },
        {
          pattern: /\/api\/([^\/]+)/g, 
          replacement: '/scramjet/api/$1'
        }
      ]
    });

    // Content modification rules
    this.contentModifiers.set('html', this.modifyHtmlContent.bind(this));
    this.contentModifiers.set('js', this.modifyJsContent.bind(this));
    this.contentModifiers.set('css', this.modifyCssContent.bind(this));
  }

  rewriteUrl(url, baseUrl = 'https://now.gg') {
    const rules = this.rewriteRules.get('now.gg');
    if (!rules) return url;

    let rewrittenUrl = url;
    rules.rules.forEach(rule => {
      rewrittenUrl = rewrittenUrl.replace(rule.pattern, rule.replacement);
    });

    return rewrittenUrl;
  }

  modifyHtmlContent(html, proxyPrefix = '/scramjet/') {
    // Inject proxy script
    const proxyScript = `
      <script>
        // Scramjet proxy initialization
        window.__SCRAMJET_PROXY__ = {
          prefix: '${proxyPrefix}',
          origin: '${process.env.PROXY_ORIGIN || 'http://localhost:3000'}',
          rewriteUrl: function(url) {
            if (url.startsWith('http')) {
              return '${proxyPrefix}' + url;
            }
            return url;
          }
        };

        // Override fetch for API calls
        const originalFetch = window.fetch;
        window.fetch = function(url, options = {}) {
          if (typeof url === 'string' && url.startsWith('/')) {
            url = window.__SCRAMJET_PROXY__.prefix + 'https://now.gg' + url;
          }
          return originalFetch(url, options);
        };

        // Override XMLHttpRequest
        const originalXHR = XMLHttpRequest.prototype.open;
        XMLHttpRequest.prototype.open = function(method, url, async, user, password) {
          if (typeof url === 'string' && url.startsWith('/')) {
            url = window.__SCRAMJET_PROXY__.prefix + 'https://now.gg' + url;
          }
          return originalXHR.call(this, method, url, async, user, password);
        };
      </script>
    `;

    // Inject before closing head tag
    html = html.replace('</head>', proxyScript + '</head>');

    // Rewrite URLs in HTML
    html = html.replace(/href=["']([^"']+)["']/g, (match, url) => {
      if (url.startsWith('http')) {
        return `href="${proxyPrefix}${url}"`;
      }
      return match;
    });

    html = html.replace(/src=["']([^"']+)["']/g, (match, url) => {
      if (url.startsWith('http')) {
        return `src="${proxyPrefix}${url}"`;
      }
      return match;
    });

    // Remove frame-busting code
    html = html.replace(/if\s*\(\s*top\s*!=\s*self\s*\)[^}]*}/g, '');
    html = html.replace(/if\s*\(\s*window\s*!=\s*top\s*\)[^}]*}/g, '');

    return html;
  }

  modifyJsContent(js, proxyPrefix = '/scramjet/') {
    // Disable frame-busting
    js = js.replace(/top\.location\s*=\s*self\.location/g, '// disabled frame buster');
    js = js.replace(/if\s*\(\s*top\s*!=\s*self\s*\)/g, 'if (false)');

    // Proxy WebSocket connections
    js = js.replace(/new\s+WebSocket\s*\(/g, 'new WebSocket(window.__SCRAMJET_PROXY__.rewriteUrl(');

    return js;
  }

  modifyCssContent(css, proxyPrefix = '/scramjet/') {
    // Rewrite URL references in CSS
    css = css.replace(/url\(["']?([^"')]+)["']?\)/g, (match, url) => {
      if (url.startsWith('http')) {
        return `url("${proxyPrefix}${url}")`;
      }
      return match;
    });

    return css;
  }

  processResponse(proxyRes, req, res) {
    const contentType = proxyRes.headers['content-type'] || '';
    
    // Remove frame-busting headers
    delete proxyRes.headers['x-frame-options'];
    delete proxyRes.headers['content-security-policy'];
    
    // Add CORS headers
    proxyRes.headers['access-control-allow-origin'] = '*';
    proxyRes.headers['access-control-allow-methods'] = 'GET, POST, PUT, DELETE, OPTIONS';
    proxyRes.headers['access-control-allow-headers'] = '*';

    // Modify content based on type
    if (contentType.includes('text/html')) {
      return this.modifyContent(proxyRes, 'html');
    } else if (contentType.includes('application/javascript') || contentType.includes('text/javascript')) {
      return this.modifyContent(proxyRes, 'js');
    } else if (contentType.includes('text/css')) {
      return this.modifyContent(proxyRes, 'css');
    }

    return proxyRes;
  }

  modifyContent(proxyRes, type) {
    const modifier = this.contentModifiers.get(type);
    if (!modifier) return proxyRes;

    let body = '';
    proxyRes.on('data', chunk => {
      body += chunk;
    });

    proxyRes.on('end', () => {
      const modifiedContent = modifier(body);
      proxyRes.write(modifiedContent);
      proxyRes.end();
    });

    return proxyRes;
  }
}

module.exports = ScramjetIntegration;
