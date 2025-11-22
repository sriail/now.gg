class BareProxyClient {
    constructor() {
        this.iframe = document.getElementById('gameFrame');
        this.loading = document.getElementById('loading');
        this.errorContainer = document.getElementById('errorContainer');
        this.statusIndicator = document.getElementById('statusIndicator');
        this.statusText = document.getElementById('statusText');
        this.urlInput = document.getElementById('urlInput');
        
        this.bareOrigin = window.location.origin;
        this.currentUrl = '';
        this.requestCount = 0;
        
        this.initializeEventListeners();
        this.checkServerHealth();
        
        // Load initial page after short delay
        setTimeout(() => {
            this.loadInitialPage();
        }, 500);
    }

    initializeEventListeners() {
        // Navigation buttons
        document.getElementById('refreshBtn').addEventListener('click', () => {
            this.refreshPage();
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
            this.refreshPage();
        });

        document.getElementById('homeRetryBtn').addEventListener('click', () => {
            this.loadUrl('https://now.gg');
        });

        // URL input events
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
            this.onPageLoaded();
        });

        this.iframe.addEventListener('error', (e) => {
            console.error('Iframe error:', e);
            this.onPageError('Failed to load page content');
        });

        // Keyboard shortcuts
        document.addEventListener('keydown', (e) => {
            if (e.key === 'F11') {
                e.preventDefault();
                this.toggleFullscreen();
            } else if (e.key === 'F5' || (e.ctrlKey && e.key === 'r')) {
                e.preventDefault();
                this.refreshPage();
            } else if (e.ctrlKey && e.key === 'l') {
                e.preventDefault();
                this.urlInput.focus();
                this.urlInput.select();
            }
        });
    }

    async checkServerHealth() {
        try {
            console.log('Checking server health...');
            const response = await fetch('/health');
            const data = await response.json();
            
            if (data.status === 'ok') {
                console.log('Server health check passed:', data);
                this.updateStatus('Server ready', 'success');
                document.getElementById('serverStatus').textContent = 'Ready';
            } else {
                throw new Error('Server health check failed');
            }
        } catch (error) {
            console.error('Server health check failed:', error);
            this.updateStatus('Server unavailable', 'error');
            document.getElementById('serverStatus').textContent = 'Offline';
        }
    }

    loadInitialPage() {
        const urlParams = new URLSearchParams(window.location.search);
        const targetUrl = urlParams.get('url') || 'https://now.gg';
        this.loadUrl(targetUrl);
    }

    loadUrl(targetUrl) {
        console.log('Loading URL:', targetUrl);
        
        // Validate and normalize URL
        if (!targetUrl) {
            targetUrl = 'https://now.gg';
        }

        // Add protocol if missing
        if (!targetUrl.startsWith('http://') && !targetUrl.startsWith('https://')) {
            targetUrl = 'https://' + targetUrl;
        }

        // Validate URL format
        try {
            const testUrl = new URL(targetUrl);
            console.log('Validated URL:', testUrl.href);
        } catch (error) {
            console.error('Invalid URL:', error);
            this.showError('Invalid URL format. Please enter a valid URL.');
            return;
        }

        this.currentUrl = targetUrl;
        this.urlInput.value = targetUrl;
        this.requestCount++;
        document.getElementById('requestCount').textContent = this.requestCount;

        this.showLoading();
        this.hideError();
        
        const hostname = new URL(targetUrl).hostname;
        this.updateStatus(`Connecting to ${hostname}...`, 'loading');

        // Test the bare proxy endpoint first
        this.testBareEndpoint(targetUrl).then((success) => {
            if (success) {
                this.loadThroughIframe(targetUrl);
            } else {
                this.onPageError('Bare proxy endpoint not responding');
            }
        });
    }

    async testBareEndpoint(targetUrl) {
        try {
            const proxyUrl = `${this.bareOrigin}/bare/v1/proxy?url=${encodeURIComponent(targetUrl)}`;
            console.log('Testing bare endpoint:', proxyUrl);
            
            const response = await fetch(proxyUrl, {
                method: 'HEAD',
                cache: 'no-cache'
            });
            
            console.log('Bare endpoint test response:', response.status, response.statusText);
            return response.ok;
        } catch (error) {
            console.error('Bare endpoint test failed:', error);
            return false;
        }
    }

    loadThroughIframe(targetUrl) {
        // Create the bare proxy URL
        const proxyUrl = `${this.bareOrigin}/bare/v1/proxy?url=${encodeURIComponent(targetUrl)}`;
        
        console.log('Loading iframe with URL:', proxyUrl);
        
        // Clear previous iframe source
        this.iframe.src = '';
        
        // Set loading timeout
        this.loadTimeout = setTimeout(() => {
            this.onPageError('Page load timeout - server may be overloaded');
        }, 45000); // Increased timeout for slow connections

        // Load the URL in iframe
        setTimeout(() => {
            this.iframe.src = proxyUrl;
        }, 100);

        // Update browser URL
        const newUrl = new URL(window.location);
        newUrl.searchParams.set('url', targetUrl);
        window.history.pushState({ url: targetUrl }, '', newUrl);
    }

    refreshPage() {
        console.log('Refreshing page...');
        if (this.currentUrl) {
            // Clear iframe and reload
            this.iframe.src = '';
            setTimeout(() => {
                this.loadUrl(this.currentUrl);
            }, 100);
        } else {
            this.loadUrl('https://now.gg');
        }
    }

    onPageLoaded() {
        console.log('Page loaded successfully');
        clearTimeout(this.loadTimeout);
        this.hideLoading();
        this.hideError();
        
        const hostname = this.currentUrl ? new URL(this.currentUrl).hostname : 'Unknown';
        this.updateStatus(`Connected to ${hostname}`, 'success');

        // Check if content is actually loaded
        setTimeout(() => {
            this.validateIframeContent();
        }, 2000);
    }

    validateIframeContent() {
        try {
            // Try to check if iframe has content
            const iframeWindow = this.iframe.contentWindow;
            if (iframeWindow) {
                console.log('Iframe content window accessible');
            }
        } catch (error) {
            // CORS error is expected for cross-origin content
            console.log('Iframe CORS restriction active (expected)');
        }

        // Additional check: see if iframe is at least trying to load
        if (!this.iframe.src || this.iframe.src === 'about:blank') {
            console.warn('Iframe src is empty or blank');
            this.onPageError('Iframe failed to load content');
        }
    }

    onPageError(message) {
        console.error('Page error:', message);
        clearTimeout(this.loadTimeout);
        this.hideLoading();
        this.showError(message);
        this.updateStatus('Connection failed', 'error');
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

    updateStatus(text, type = 'loading') {
        this.statusText.textContent = text;
        this.statusIndicator.className = `status-indicator ${type}`;
        
        // Log status changes
        console.log(`Status: ${text} (${type})`);
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

    // Debug method to test bare server directly
    async testBareServer() {
        try {
            console.log('Testing bare server info endpoint...');
            const response = await fetch('/bare/v1/info');
            const info = await response.json();
            console.log('Bare server info:', info);
            return info;
        } catch (error) {
            console.error('Failed to get bare server info:', error);
            return null;
        }
    }

    // Debug method to test direct proxy
    async testDirectProxy(url = 'https://httpbin.org/get') {
        try {
            console.log('Testing direct proxy with:', url);
            const proxyUrl = `${this.bareOrigin}/bare/v1/proxy?url=${encodeURIComponent(url)}`;
            const response = await fetch(proxyUrl);
            const text = await response.text();
            console.log('Direct proxy test result:', response.status, text.substring(0, 200));
            return response.ok;
        } catch (error) {
            console.error('Direct proxy test failed:', error);
            return false;
        }
    }
}

// Initialize the bare proxy client when the page loads
document.addEventListener('DOMContentLoaded', () => {
    console.log('Initializing Bare Proxy Client...');
    window.bareProxy = new BareProxyClient();
    
    // Add debug methods to window for testing
    window.testBareServer = () => window.bareProxy.testBareServer();
    window.testDirectProxy = (url) => window.bareProxy.testDirectProxy(url);
    
    console.log('Bare Proxy Client initialized');
    console.log('Debug methods available: testBareServer(), testDirectProxy(url)');
});

// Handle browser back/forward navigation
window.addEventListener('popstate', (event) => {
    if (event.state && event.state.url) {
        window.bareProxy.loadUrl(event.state.url);
    }
});
