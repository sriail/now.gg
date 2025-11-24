# Now.gg Proxy

A simple proxy server optimized for loading now.gg.

## Quick Start

```bash
npm install
npm start
```

Open `http://localhost:3000` in your browser.

## Features

- Minimal UI - no search bar or navigation bloat
- Service worker for efficient proxying
- Cookie support for now.gg compatibility
- Frame-busting removal for iframe embedding
- Compressed content handling (gzip, deflate, brotli)

## Endpoints

- `/` - Main proxy interface
- `/bare/v1/proxy?url={target}` - Proxy endpoint
- `/bare/v1/info` - Server info
- `/health` - Health check

## Configuration

```bash
PORT=8080 npm start  # Change port (default: 3000)
```

## License

MIT
