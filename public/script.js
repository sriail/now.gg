// Simple now.gg proxy client
(function() {
    'use strict';

    const NOW_GG_URL = 'https://now.gg';
    const PROXY_ENDPOINT = '/bare/v1/proxy';
    
    let iframe = null;
    let loading = null;
    let errorContainer = null;
    let loadTimeout = null;

    // Initialize on DOM load
    document.addEventListener('DOMContentLoaded', init);

    function init() {
        iframe = document.getElementById('gameFrame');
        loading = document.getElementById('loading');
        errorContainer = document.getElementById('errorContainer');

        // Set up retry button
        const retryBtn = document.getElementById('retryBtn');
        if (retryBtn) {
            retryBtn.addEventListener('click', () => loadNowGg());
        }

        // Set up iframe load handlers
        iframe.addEventListener('load', onLoad);
        iframe.addEventListener('error', () => showError('Failed to load content'));

        // Register service worker
        registerServiceWorker();

        // Load now.gg
        loadNowGg();
    }

    async function registerServiceWorker() {
        if ('serviceWorker' in navigator) {
            try {
                const registration = await navigator.serviceWorker.register('/sw.js');
                console.log('Service worker registered');
            } catch (err) {
                console.log('Service worker registration skipped:', err.message);
            }
        }
    }

    function loadNowGg() {
        showLoading();
        hideError();

        // Clear any existing timeout
        if (loadTimeout) {
            clearTimeout(loadTimeout);
        }

        // Build proxy URL
        const proxyUrl = `${PROXY_ENDPOINT}?url=${encodeURIComponent(NOW_GG_URL)}`;

        // Set timeout for loading
        loadTimeout = setTimeout(() => {
            showError('Loading timed out. Please retry.');
        }, 30000);

        // Clear iframe and load
        iframe.src = '';
        setTimeout(() => {
            iframe.src = proxyUrl;
        }, 50);
    }

    function onLoad() {
        if (loadTimeout) {
            clearTimeout(loadTimeout);
            loadTimeout = null;
        }
        hideLoading();
        hideError();
    }

    function showLoading() {
        if (loading) loading.style.display = 'block';
        if (iframe) iframe.style.display = 'none';
    }

    function hideLoading() {
        if (loading) loading.style.display = 'none';
        if (iframe) iframe.style.display = 'block';
    }

    function showError(message) {
        if (loadTimeout) {
            clearTimeout(loadTimeout);
            loadTimeout = null;
        }
        const errorText = document.getElementById('errorText');
        if (errorText) errorText.textContent = message;
        if (errorContainer) errorContainer.style.display = 'block';
        if (iframe) iframe.style.display = 'none';
        hideLoading();
    }

    function hideError() {
        if (errorContainer) errorContainer.style.display = 'none';
    }
})();
