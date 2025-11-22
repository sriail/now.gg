class IPRotator {
  constructor() {
    this.proxies = this.loadProxies();
    this.currentIndex = 0;
    this.rotationInterval = null;
    this.rotationTime = 30000; // 30 seconds
    this.failedProxies = new Set();
  }

  loadProxies() {
    // Load from environment variables or config file
    const proxyList = process.env.PROXY_LIST ? 
      JSON.parse(process.env.PROXY_LIST) : 
      this.getDefaultProxies();
    
    return proxyList.map(proxy => ({
      ...proxy,
      active: true,
      lastUsed: null,
      failures: 0
    }));
  }

  getDefaultProxies() {
    // Default free proxy list (replace with your own proxy providers)
    return [
      {
        host: '8.8.8.8',
        port: 80,
        type: 'http',
        auth: null
      },
      {
        host: '1.1.1.1', 
        port: 80,
        type: 'http',
        auth: null
      }
      // Add more proxy servers here
    ];
  }

  getCurrentProxy() {
    const activeProxies = this.proxies.filter(p => 
      p.active && !this.failedProxies.has(p.host)
    );
    
    if (activeProxies.length === 0) {
      console.log('No active proxies available, using direct connection');
      return null;
    }
    
    const proxy = activeProxies[this.currentIndex % activeProxies.length];
    proxy.lastUsed = Date.now();
    
    return proxy;
  }

  rotateProxy() {
    const activeProxies = this.proxies.filter(p => 
      p.active && !this.failedProxies.has(p.host)
    );
    
    if (activeProxies.length > 1) {
      this.currentIndex = (this.currentIndex + 1) % activeProxies.length;
      console.log(`Rotated to proxy: ${activeProxies[this.currentIndex].host}`);
    }
  }

  markProxyAsFailed() {
    const currentProxy = this.getCurrentProxy();
    if (currentProxy) {
      currentProxy.failures++;
      
      if (currentProxy.failures >= 3) {
        this.failedProxies.add(currentProxy.host);
        console.log(`Proxy ${currentProxy.host} marked as failed`);
      }
      
      // Immediately rotate to next proxy
      this.rotateProxy();
    }
  }

  resetFailedProxies() {
    // Reset failed proxies every 10 minutes
    this.failedProxies.clear();
    this.proxies.forEach(proxy => {
      proxy.failures = 0;
    });
    console.log('Reset all failed proxies');
  }

  startRotation() {
    // Auto-rotate proxies
    this.rotationInterval = setInterval(() => {
      this.rotateProxy();
    }, this.rotationTime);

    // Reset failed proxies periodically
    setInterval(() => {
      this.resetFailedProxies();
    }, 600000); // 10 minutes

    console.log('IP rotation started');
  }

  stopRotation() {
    if (this.rotationInterval) {
      clearInterval(this.rotationInterval);
      this.rotationInterval = null;
      console.log('IP rotation stopped');
    }
  }

  getActiveProxyCount() {
    return this.proxies.filter(p => 
      p.active && !this.failedProxies.has(p.host)
    ).length;
  }

  addProxy(proxy) {
    this.proxies.push({
      ...proxy,
      active: true,
      lastUsed: null,
      failures: 0
    });
  }

  removeProxy(host) {
    this.proxies = this.proxies.filter(p => p.host !== host);
    this.failedProxies.delete(host);
  }
}

module.exports = IPRotator;
