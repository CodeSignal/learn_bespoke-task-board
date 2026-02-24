const http = require('http');
const fs = require('fs');
const path = require('path');
const url = require('url');

let WebSocket = null;
let isWebSocketAvailable = false;
try { WebSocket = require('ws'); isWebSocketAvailable = true; console.log('WebSocket support enabled'); }
catch (e) { console.log('WebSocket support disabled'); }

const DIST_DIR = path.join(__dirname, 'dist');
const isProduction = process.env.IS_PRODUCTION === 'true';
if (isProduction && !fs.existsSync(DIST_DIR)) throw new Error('dist directory does not exist');
const PORT = isProduction ? 3000 : (process.env.PORT || 3000);
const wsClients = new Set();

const mimeTypes = {
  '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css',
  '.json': 'application/json', '.png': 'image/png', '.jpg': 'image/jpeg',
  '.svg': 'image/svg+xml', '.woff': 'font/woff', '.woff2': 'font/woff2', '.ttf': 'font/ttf'
};

function serveFile(filePath, res) {
  fs.readFile(filePath, (err, data) => {
    if (err) { res.writeHead(404); res.end('Not found'); return; }
    const ext = path.extname(filePath).toLowerCase();
    res.writeHead(200, { 'Content-Type': mimeTypes[ext] || 'text/plain' });
    res.end(data);
  });
}

function handlePostRequest(req, res, parsedUrl) {
  if (parsedUrl.pathname === '/message') {
    let body = '';
    req.on('data', c => { body += c.toString(); });
    req.on('end', () => {
      try {
        const data = JSON.parse(body);
        if (!data.message || !isWebSocketAvailable) { res.writeHead(400); res.end('{}'); return; }
        wsClients.forEach(c => { if (c.readyState === WebSocket.OPEN) c.send(JSON.stringify({ type: 'message', message: data.message })); });
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: true }));
      } catch (e) { res.writeHead(400); res.end('Invalid JSON'); }
    });
  } else { res.writeHead(404); res.end('Not found'); }
}

const server = http.createServer((req, res) => {
  const parsedUrl = url.parse(req.url, true);
  let pathName = parsedUrl.pathname === '/' ? '/index.html' : parsedUrl.pathname;
  if (req.method === 'POST') { handlePostRequest(req, res, parsedUrl); return; }
  if (isProduction) {
    let filePath = path.join(DIST_DIR, pathName.replace(/^\/+/, ''));
    if (path.relative(path.resolve(DIST_DIR), path.resolve(filePath)).startsWith('..')) { res.writeHead(403); res.end('Forbidden'); return; }
    serveFile(filePath, res);
  } else { res.writeHead(404); res.end('Not found (dev mode)'); }
});

if (isWebSocketAvailable) {
  const wss = new WebSocket.Server({ server, path: '/ws' });
  wss.on('connection', ws => { wsClients.add(ws); ws.on('close', () => wsClients.delete(ws)); ws.on('error', () => wsClients.delete(ws)); });
}

server.listen(PORT, () => console.log(`Server running at http://localhost:${PORT}`));
server.on('error', err => { console.error(err.code === 'EADDRINUSE' ? `Port ${PORT} in use` : err); process.exit(1); });
process.on('SIGINT', () => { server.close(() => process.exit(0)); });
