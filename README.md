# Now.gg Proxy

A proxy server optimized for loading now.gg and cloud gaming services like Roblox.

## Quick Start

```bash
npm install
npm start
```

Open `http://localhost:3000` in your browser.

## Features

- **Rate Limiting**: Sliding window rate limiter to prevent abuse (100 requests/minute per IP)
- **URL Rewriting**: All URLs in HTML/CSS/JS are automatically rewritten to go through the proxy
- **WebSocket Support**: WebSocket proxy for real-time gaming connections
- **Service worker**: Efficient proxying for now.gg domains
- **Cookie support**: Full cookie forwarding for session persistence
- **Frame-busting removal**: Removes X-Frame-Options and CSP headers for iframe embedding
- **Compressed content handling**: Supports gzip, deflate, and brotli

## Supported Domains

The proxy is optimized for:
- now.gg and its subdomains (play.now.gg, accounts.now.gg, api.now.gg, etc.)
- Roblox domains (roblox.com, rbxcdn.com, etc.)

## Endpoints

| Endpoint | Description |
|----------|-------------|
| `/` | Main proxy interface |
| `/bare/v1/proxy?url={target}` | HTTP proxy endpoint |
| `/bare/v1/ws?url={target}` | WebSocket proxy endpoint |
| `/bare/v1/info` | Server info and capabilities |
| `/health` | Health check |

## Configuration

```bash
PORT=8080 npm start  # Change port (default: 3000)
```

## Rate Limiting

The server includes built-in rate limiting:
- **Window**: 60 seconds
- **Max Requests**: 100 per IP per window
- Headers returned: `X-RateLimit-Limit`, `X-RateLimit-Remaining`, `X-RateLimit-Reset`

## API Response Headers

All proxy responses include:
- `Access-Control-Allow-Origin: *`
- `Access-Control-Allow-Methods: GET, POST, PUT, DELETE, OPTIONS, HEAD`
- `Access-Control-Allow-Headers: *`
- `X-Proxy-Set-Cookie`: Contains any Set-Cookie headers from the target

## Testing

```bash
npm test
```

## License

MIT
