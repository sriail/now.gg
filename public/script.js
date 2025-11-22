class SimpleBareProxy {
    constructor() {
        this.iframe = document.getElementById('gameFrame');
        this.loading = document.getElementById('loading');
        this.errorContainer = document.getElementById('errorContainer');
        this.statusText = document.getElementById('statusText');
        this.urlInput = document.getElementById('urlInput');
        
        this.currentUrl = '';
        this.requestCount = 0;
        
        console.log('🚀 Simple Bare Proxy Client starting...');
        
        this.initializeEventListeners();
        this.testServer();
        
        // Auto-load after short delay
        setTimeout(() => {
            this.loadInitialPage();
        }, 1000);
    }

    initializeEventListeners() {
        console.log('🔧 Setting up event listeners...');
        
        // Navigation buttons
        document.getElementById('refreshBtn').addEventListener('click', () => {
            this.refresh();
        });

        document.getElementById('fullscreenBtn').addEventListener('click', () => {
            this.toggleFullscreen();
        });

        document.getElementById('homeBtn').addEventListener('click', () => {
            this.loadUrl('https://now.gg');
        });

        document.getElementById('goBtn').addEventListener('click', () => {
            const url = this.urlInput.value.trim();
            if (url) {
                this.loadUrl(url);
            }
        });

        document.getElementById('retryBtn').addEventListener('click', () => {
            this.refresh();
        });

        document.getElementById('homeRetryBtn').addEventListener('click', () => {
            this.loadUrl('https://now.gg');
        });

        // URL input
        this.urlInput.addEventListener('keypress', (e) => {
            if (e.key === 'Enter') {
                const url = this.urlInput.value.trim();
                if (url) {
                    this.loadUrl(url);
                }
            }
        });

        // Iframe events
        this.iframe.addEventListener('load', () => {
            this.onLoad();
        });

        this.iframe.addEventListener('error', () => {
            this.onError('Iframe failed to load');
        });
    }

    async testServer() {
        console.log('🧪 Testing server...');
        
        try {
            const response = await fetch('/health');
            const data = await response.json();
            
            if (data.status === 'ok') {
                console.log('✅ Server test passed:', data);
                this.updateStatus('Server ready');
                document.getElementById('serverStatus').textContent = 'Ready';
            } else {
                throw new Error('Health check failed');
            }
        } catch (error) {
            console.error('❌ Server test failed:', error);
            this.updateStatus('Server error');
            document.getElementById('serverStatus').textContent = 'Error';
        }

        // Test the proxy endpoint
        try {
            console.log('🧪 Testing proxy endpoint...');
            const testUrl = 'https://httpbin.org/get';
            const proxyUrl = `/bare/v1/proxy?url=${encodeURIComponent(testUrl)}`;
            
            const response = await fetch(proxyUrl);
            if (response.ok) {
                console.log('✅ Proxy endpoint test passed');
            } else {
                console.error('❌ Proxy endpoint test failed:', response.status, response.statusText);
            }
        } catch (error) {
            console.error('❌ Proxy endpoint test error:', error);
        }
    }

    loadInitialPage() {
        console.log('📄 Loading initial page...');
        const urlParams = new URLSearchParams(window.location.search);
        const targetUrl = urlParams.get('url') || 'https://now.gg';
        this.loadUrl(targetUrl);
    }

    loadUrl(targetUrl) {
        console.log(`🎯 Loading URL: ${targetUrl}`);
        
        // Normalize URL
        if (!targetUrl.startsWith('http://') && !targetUrl.startsWith('https://')) {
            targetUrl = 'https://' + targetUrl;
        }

        // Validate URL
        try {
            new URL(targetUrl);
        } catch (error) {
            console.error('❌ Invalid URL:', error);
            this.showError('Invalid URL format');
            return;
        }

        this.currentUrl = targetUrl;
        this.urlInput.value = targetUrl;
        this.requestCount++;
        
        document.getElementById('requestCount').textContent = this.requestCount;

        this.showLoading();
        this.hideError();
        
        const hostname = new URL(targetUrl).hostname;
        this.updateStatus(`Connecting to ${hostname}...`);

        // Build proxy URL
        const proxyUrl = `/bare/v1/proxy?url=${encodeURIComponent(targetUrl)}`;
        
        console.log(`🔗 Proxy URL: ${proxyUrl}`);

        // Test the URL first
        this.testProxyUrl(proxyUrl).then((works) => {
            if (works) {
                console.log('✅ Proxy URL test passed, loading in iframe');
                this.loadInIframe(proxyUrl);
            } else {
                console.error('❌ Proxy URL test failed');
                this.onError('Proxy connection failed');
            }
        });
    }

    async testProxyUrl(proxyUrl) {
        try {
            console.log(`🧪 Testing proxy URL: ${proxyUrl}`);
            const response = await fetch(proxyUrl, {
                method: 'HEAD',
                cache: 'no-cache'
            });
            
            console.log(`📊 Proxy test result: ${response.status} ${response.statusText}`);
            return response.ok;
        } catch (error) {
            console.error('❌ Proxy URL test error:', error);
            return false;
        }
    }

    loadInIframe(proxyUrl) {
        console.log(`📺 Loading in iframe: ${proxyUrl}`);
        
        // Clear iframe
        this.iframe.src = '';
        
        // Set timeout
        this.loadTimeout = setTimeout(() => {
            console.error('⏰ Load timeout');
            this.onError('Load timeout - page took too long to respond');
        }, 45000);

        // Load in iframe
        setTimeout(() => {
            this.iframe.src = proxyUrl;
        }, 100);
    }

    refresh() {
        console.log('🔄 Refreshing...');
        if (this.currentUrl) {
            this.iframe.src = '';
            setTimeout(() => {
                this.loadUrl(this.currentUrl);
            }, 100);
        } else {
            this.loadUrl('https://now.gg');
        }
    }

    onLoad() {
        console.log('✅ Iframe loaded successfully');
        clearTimeout(this.loadTimeout);
        this.hideLoading();
        this.hideError();
        
        const hostname = this.currentUrl ? new URL(this.currentUrl).hostname : 'Unknown';
        this.updateStatus(`Connected to ${hostname}`);
    }

    onError(message) {
        console.error('❌ Load error:', message);
        clearTimeout(this.loadTimeout);
        this.hideLoading();
        this.showError(message);
        this.updateStatus('Connection failed');
    }

    showLoading() {
        this.loading.style.display = 'block';
        this.iframe.style.display = 'none';
    }

    hideLoading() {
        this.loading.style.display = 'none';
        this.iframe.style.display = 'block';
    }

    showError(message) {
        document.getElementById('errorText').textContent = message;
        this.errorContainer.style.display = 'block';
        this.iframe.style.display = 'none';
    }

    hideError() {
        this.errorContainer.style.display = 'none';
    }

    updateStatus(text) {
        this.statusText.textContent = text;
        console.log(`📊 Status: ${text}`);
    }

    toggleFullscreen() {
        const container = document.querySelector('.container');
        
        if (container.classList.contains('fullscreen')) {
            container.classList.remove('fullscreen');
            document.getElementById('fullscreenBtn').textContent = 'Fullscreen';
        } else {
            container.classList.add('fullscreen');
            document.getElementById('fullscreenBtn').textContent = 'Exit Fullscreen';
        }
    }

    // Debug helpers
    async debugProxy(url = 'https://httpbin.org/get') {
        console.log(`🐛 Debug proxy test with: ${url}`);
        const proxyUrl = `/bare/v1/proxy?url=${encodeURIComponent(url)}`;
        
        try {
            const response = await fetch(proxyUrl);
            const text = await response.text();
            console.log('🐛 Debug result:', response.status, text.substring(0, 500));
            return { ok: response.ok, status: response.status, preview: text.substring(0, 500) };
        } catch (error) {
            console.error('🐛 Debug error:', error);
            return { ok: false, error: error.message };
        }
    }

    async debugServer() {
        console.log('🐛 Debug server info');
        try {
            const response = await fetch('/bare/v1/info');
            const info = await response.json();
            console.log('🐛 Server info:', info);
            return info;
        } catch (error) {
            console.error('🐛 Server info error:', error);
            return { error: error.message };
        }
    }
}

// Initialize when page loads
document.addEventListener('DOMContentLoaded', () => {
    console.log('🌐 DOM loaded, starting proxy client...');
    window.bareProxy = new SimpleBareProxy();
    
    // Add debug helpers to console
    window.debugProxy = (url) => window.bareProxy.debugProxy(url);
    window.debugServer = () => window.bareProxy.debugServer();
    
    console.log('🔧 Debug commands available:');
    console.log('  debugProxy(url) - Test proxy with any URL');
    console.log('  debugServer() - Get server info');
});
