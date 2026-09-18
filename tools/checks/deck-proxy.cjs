/* The deck as the portal serves it, with this worktree's tool file in place of
   the deployed one. /deck/<id> and /tools/concept-deck.html come from disk;
   every read under /api goes to the live portal, so the pictures are the real
   ones and same-origin (a swatch can only be cut from a same-origin picture).
   Nothing is written: anything but GET/HEAD is refused here, before it leaves. */
const http = require('http');
const https = require('https');
const fs = require('fs');
const path = require('path');

const LIVE = 'essentia-portal-backup-w6xi.vercel.app';
const TOOL = path.resolve(process.argv[2] || 'tools/concept-deck-configurator.html');
const PORT = +(process.argv[3] || 4188);

http.createServer((req, res) => {
  const url = req.url || '/';
  if (/^\/deck\/[0-9a-fA-F-]{36}\/?(\?.*)?$/.test(url) || url.startsWith('/tools/concept-deck.html')) {
    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' });
    fs.createReadStream(TOOL).pipe(res);
    return;
  }
  if (req.method !== 'GET' && req.method !== 'HEAD') {
    res.writeHead(403, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'The local check does not write to the live portal.' }));
    return;
  }
  const up = https.request({ host: LIVE, path: url, method: req.method,
    headers: { accept: req.headers.accept || '*/*', 'user-agent': 'deck-local-check' } }, (r) => {
    const h = Object.assign({}, r.headers);
    delete h['content-security-policy']; delete h['strict-transport-security'];
    res.writeHead(r.statusCode || 502, h);
    r.pipe(res);
  });
  /* a reader who closes the tab mid-picture must not take the check down with them */
  up.on('error', (e) => {
    if (!res.headersSent) res.writeHead(502);
    if (!res.writableEnded) res.end(String(e.message));
  });
  res.on('close', () => { if (!res.writableFinished) up.destroy(); });
  up.end();
}).listen(PORT, () => console.log('deck check on http://localhost:' + PORT + ' using ' + TOOL));
