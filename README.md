# Now.gg Bare Proxy Server

A simple, zero-configuration bare proxy server for accessing now.gg and other websites without requiring external proxy services.

## Features

- 🚀 **Zero Configuration** - Works out of the box without any setup
- 🔒 **Direct Proxying** - No external proxy services required
- 🎮 **Now.gg Optimized** - Designed specifically for now.gg gaming platform
- 🌐 **Universal Access** - Can proxy any website
- 📊 **Comprehensive Logging** - Detailed request/response logging for debugging
- 🛡️ **CORS Enabled** - Automatic CORS header management
- ⚡ **Fast & Simple** - Minimal overhead, maximum performance

## Quick Start

### Installation

```bash
# Clone the repository
git clone https://github.com/sriail/now.gg.git
cd now.gg

# Install dependencies
npm install

# Start the server
npm start
```

### Usage

1. **Start the server:**
   ```bash
   npm start
   ```

2. **Open your browser:**
   Navigate to `http://localhost:3000`

3. **Enter a URL:**
   - Default: `https://now.gg` is pre-loaded
   - Enter any URL you want to proxy
   - Click "Go" to load the site

4. **Navigate:**
   - Use the "Refresh" button to reload the current page
   - Use "Now.gg Home" to quickly go back to now.gg
   - Use "Fullscreen" to maximize the viewing area

## How It Works

### Proxy Endpoint

The server provides a simple HTTP proxy endpoint:

```
GET /bare/v1/proxy?url={target_url}
```

**Example:**
```bash
curl "http://localhost:3000/bare/v1/proxy?url=https://now.gg"
```

### Server Endpoints

- `/` - Main proxy interface (web UI)
- `/bare/v1/proxy?url={target}` - Proxy endpoint
- `/bare/v1/info` - Server information
- `/health` - Health check
- `/test` - Test endpoint

### Architecture

```
Browser → Proxy UI → Bare Proxy Server → Target Website
                           ↓
                    Remove frame-busting
                    Add CORS headers
                    Forward request/response
```

## Configuration

### Environment Variables

While the server works with zero configuration, you can customize it:

```bash
# Optional: Set custom port (default: 3000)
PORT=8080 npm start
```

### No .env Required

The server is designed to work immediately without any `.env` file or configuration.

## Development

### Run in Development Mode

```bash
npm run dev
```

This uses `nodemon` for automatic reloading on file changes.

### Project Structure

```
now.gg/
├── server.js              # Main server implementation
├── public/
│   ├── index.html        # Proxy UI
│   ├── script.js         # Client-side logic
│   └── style.css         # Styling
├── scramjet-integration.js  # Advanced proxy features (optional)
└── package.json          # Dependencies
```

## Troubleshooting

### Connection Issues

**Problem:** "Connection failed" errors

**Solutions:**
1. Check the browser console for detailed error messages
2. Verify the target URL is correct and accessible
3. Check server logs for detailed request information
4. Some websites may block proxy access (anti-bot measures)

### Logging

The server provides comprehensive logging:

```
🚀 Server startup information
📍 Available endpoints
🎯 Incoming proxy requests
📡 Outgoing requests with details
📥 Response information
✅ Success messages
❌ Error messages with codes
```

### Common Error Codes

- `ENOTFOUND` - DNS lookup failed (domain doesn't exist or DNS issues)
- `ECONNREFUSED` - Target server refused connection
- `ETIMEDOUT` - Connection timed out (>30s)
- `ECONNRESET` - Connection was reset by target
- `EHOSTUNREACH` - Host is unreachable (network routing issue)

## Security

### Sandboxing

The iframe uses comprehensive sandboxing:

```html
sandbox="allow-same-origin allow-scripts allow-popups allow-forms 
         allow-pointer-lock allow-top-navigation allow-downloads"
```

### CORS Headers

Automatic CORS headers are added to all proxied responses:
- `Access-Control-Allow-Origin: *`
- `Access-Control-Allow-Methods: GET, POST, PUT, DELETE, OPTIONS, HEAD`
- `Access-Control-Allow-Headers: *`

### Removed Headers

Security headers that prevent iframe embedding are automatically removed:
- `X-Frame-Options`
- `Content-Security-Policy`
- `Content-Security-Policy-Report-Only`

## Limitations

1. **Complex Websites:** Some websites with heavy anti-bot protection may not work
2. **WebRTC:** WebRTC connections are not proxied
3. **Downloads:** Large file downloads may timeout (30s limit)
4. **Authentication:** Some authentication flows may not work through the proxy

## Browser Compatibility

- ✅ Chrome/Edge (Recommended)
- ✅ Firefox
- ✅ Safari
- ✅ Opera

## Performance

- **Latency:** Minimal (single-hop proxy)
- **Throughput:** Limited by server bandwidth
- **Timeout:** 30 seconds per request
- **Memory:** Streams responses (no buffering)

## API Reference

### GET /bare/v1/proxy

Proxy a URL through the server.

**Parameters:**
- `url` (required) - The target URL to proxy

**Response:**
- Success: Proxied content with CORS headers
- Error: JSON error object with details

**Example:**
```bash
curl "http://localhost:3000/bare/v1/proxy?url=https://example.com"
```

### GET /bare/v1/info

Get server information.

**Response:**
```json
{
  "server": "simple-bare-proxy",
  "version": "1.0.0",
  "language": "NodeJS",
  "endpoints": {
    "proxy": "/bare/v1/proxy?url={target_url}",
    "info": "/bare/v1/info"
  }
}
```

### GET /health

Health check endpoint.

**Response:**
```json
{
  "status": "ok",
  "timestamp": "2025-11-23T17:48:46.944Z",
  "server": "simple-bare-proxy",
  "uptime": 123.456
}
```

## Contributing

Contributions are welcome! Please ensure:
1. Code follows existing style
2. All endpoints continue to work
3. Documentation is updated

## License

MIT License - See LICENSE file for details

## Author

sriailcan

## Support

For issues and questions:
1. Check the logs for detailed error messages
2. Review this README for common solutions
3. Open an issue on GitHub with:
   - Error messages from console
   - Server logs
   - Steps to reproduce

## Acknowledgments

- Built with Express.js
- Uses Node.js HTTP/HTTPS modules
- Inspired by bare-server-node
