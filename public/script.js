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
        
        this.initializeEventListeners();
        this.startHealthCheck();
        this.loadInitialPage();
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
            this.loadUrl(this.urlInput.value);
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
                this.loadUrl(this.urlInput.value);
            }
        });

        // Iframe events
        this.iframe.addEventListener('load', () => {
            this.onPageLoaded();
        });

        this.iframe.addEventListener('error', () => {
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

        // Handle visibility change
        document.addEventListener('visibilitychange', () => {
            if (document.hidden) {
                this.pauseHealthCheck();
            } else {
                this.resumeHealthCheck();
            }
        });
    }

    loadInitialPage() {
        const urlParams = new URLSearchParams(window.location.search);
        const targetUrl = urlParams.get('url') || 'https://now.gg';
        this.loadUrl(targetUrl);
    }

    loadUrl(targetUrl) {
        // Validate and normalize URL
        if (!targetUrl) {
            targetUrl = 'https://now.gg';
        }

        if (!targetUrl.startsWith('http://') && !targetUrl.startsWith('https://')) {
            targetUrl = 'https://' + targetUrl;
        }

        try {
            new URL(targetUrl); // Validate URL
        } catch (error) {
            this.showError('Invalid URL format');
            return;
        }

        this.currentUrl = targetUrl;
        this.urlInput.value = targetUrl;

        this.showLoading();
        this.hideError();
        this.updateStatus(`Loading ${new URL(targetUrl).hostname}...`, 'loading');

        // Create bare proxy URL
        const proxyUrl = `${this.bareOrigin}/bare/v1/proxy?url=${encodeURIComponent(targetUrl)}`;
        
        console.log('Loading URL through bare proxy:', proxyUrl);
        
        // Add timestamp to prevent caching
        const timestamp = Date.now();
        this.iframe.src = `${proxyUrl}&t=${timestamp}`;

        // Set loading timeout
        this.loadTimeout = setTimeout(() => {
            this.onPageError('Page load timeout - please try again');
        }, 30000);

        // Update browser URL
        const newUrl = new URL(window.location);
        newUrl.searchParams.set('url', targetUrl);
        window.history.pushState({ url: targetUrl }, '', newUrl);
    }

    refreshPage() {
        if (this.currentUrl) {
            this.loadUrl(this.currentUrl);
        } else {
            this.loadUrl('https://now.gg');
        }
    }

    onPageLoaded() {
        clearTimeout(this.loadTimeout);
        this.hideLoading();
        this.hideError();
        
        const hostname = this.currentUrl ? new URL(this.currentUrl).hostname : 'Unknown';
        this.updateStatus(`Connected to ${hostname}`, 'success');

        // Try to detect if content actually loaded
        setTimeout(() => {
            this.checkIframeContent();
        }, 2000);
    }

    onPageError(message) {
        clearTimeout(this.loadTimeout);
        this.hideLoading();
        this.showError(message);
        this.updateStatus('Connection failed', 'error');
    }

    checkIframeContent() {
        try {
            // Try to access iframe (will fail due to CORS, which is expected)
            const iframeDoc = this.iframe.contentDocument;
            if (iframeDoc && iframeDoc.body.children.length === 0) {
                this.onPageError('Page content failed to load');
            }
        } catch (e) {
            // CORS error is expected and means content loaded successfully
            console.log('Page loaded successfully (CORS restriction active)');
        }
    }

    showLoading() {
        this.loading.style.display = 'block';
    }

    hideLoading() {
        this.loading.style.display = 'none';
    }

    showError(message) {
        document.getElementById('errorText').textContent = message;
        this.errorContainer.style.display = 'block';
    }

    hideError() {
        this.errorContainer.style.display = 'none';
    }

    updateStatus(text, type = 'loading') {
        this.statusText.textContent = text;
        this.statusIndicator.className = `status-indicator ${type}`;
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

    async startHealthCheck() {
        this.healthCheckInterval = setInterval(async () => {
            try {
                const response = await fetch('/health');
                const data = await response.json();
                
                if (data.status === 'ok') {
                    document.getElementById('serverStatus').textContent = 'Active';
                    document.getElementById('serverUptime').textContent = this.formatUptime(data.uptime);
                    
                    if (this.statusIndicator.classList.contains('error')) {
                        this.updateStatus('Server recovered', 'success');
                    }
                } else {
                    document.getElementById('serverStatus').textContent = 'Issues';
                }
            } catch (error) {
                document.getElementById('serverStatus').textContent = 'Offline';
                console.error('Health check failed:', error);
            }
        }, 10000);
    }

    pauseHealthCheck() {
        if (this.healthCheckInterval) {
            clearInterval(this.healthCheckInterval);
        }
    }

    resumeHealthCheck() {
        this.startHealthCheck();
    }

    formatUptime(seconds) {
        const hours = Math.floor(seconds / 3600);
        const minutes = Math.floor((seconds % 3600) / 60);
        const secs = Math.floor(seconds % 60);
        
        if (hours > 0) {
            return `${hours}h ${minutes}m ${secs}s`;
        } else if (minutes > 0) {
            return `${minutes}m ${secs}s`;
        } else {
            return `${secs}s`;
        }
    }

    // Utility method to get bare server info
    async getBareServerInfo() {
        try {
            const response = await fetch('/bare/v1/info');
            const info = await response.json();
            console.log('Bare server info:', info);
            return info;
        } catch (error) {
            console.error('Failed to get bare server info:', error);
            return null;
        }
    }
}

// Initialize the bare proxy client when the page loads
document.addEventListener('DOMContentLoaded', () => {
    window.bareProxy = new BareProxyClient();
    
    // Log server info
    window.bareProxy.getBareServerInfo().then(info => {
        if (info) {
            console.log('Bare proxy server ready:', info);
        }
    });
});

// Handle browser back/forward navigation
window.addEventListener('popstate', (event) => {
    if (event.state && event.state.url) {
        window.bareProxy.loadUrl(event.state.url);
    }
});

// Service worker registration for enhanced caching
if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('/sw.js').catch(error => {
        console.log('Service Worker registration failed:', error);
    });
}
