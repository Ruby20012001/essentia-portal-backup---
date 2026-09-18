/* The deck as an editor sees it in the portal, with this worktree's tool file
   in place of the deployed one — and nothing written anywhere but here.

   Reads go to the live portal (the real deck, the real pictures, same-origin
   so swatches can be cut). The page is told it may edit, and the writes an
   editor makes — pictures sent up, the deck saved — are kept in memory and
   served back on the next read, so a whole sitting can be checked, reload
   included, without touching the real deck. GET /__writes lists what arrived. */
const http = require('http');
const https = require('https');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const LIVE = 'essentia-portal-backup-w6xi.vercel.app';
const TOOL = path.resolve(process.argv[2] || 'tools/concept-deck-configurator.html');
const PORT = +(process.argv[3] || 4189);

const pictures = new Map();   // slot -> { mime, bytes }
const saved = new Map();      // deck id -> { state, version, at, did }
const writes = [];

function live(url) {
  return new Promise((ok, no) => {
    const up = https.request({ host: LIVE, path: url, method: 'GET',
      headers: { accept: '*/*', 'user-agent': 'deck-local-check' } }, (r) => {
      const chunks = [];
      r.on('data', (c) => chunks.push(c));
      r.on('end', () => ok({ status: r.statusCode, body: Buffer.concat(chunks) }));
    });
    up.on('error', no);
    up.end();
  });
}

function readBody(req) {
  return new Promise((ok) => {
    const chunks = [];
    req.on('data', (c) => chunks.push(c));
    req.on('end', () => ok(Buffer.concat(chunks)));
  });
}

function json(res, status, data) {
  res.writeHead(status, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' });
  res.end(JSON.stringify(data));
  return true;
}

async function editor(req, res, url) {
  let m;
  /* a cookie turns the page into a reader's: no account, nothing to change */
  const reader = /(^|;\s*)reader=1/.test(req.headers.cookie || '');
  if (reader && url === '/api/me') return json(res, 401, { error: 'Not signed in' });
  if (url === '/__writes') return json(res, 200, writes);
  if (url === '/api/me' && req.method === 'GET') {
    return json(res, 200, { user: { name: 'Local check', email: 'check@local.test' } });
  }
  if (url === '/api/auth/logout' && req.method === 'POST') return json(res, 200, { ok: true });

  if ((m = /^\/api\/decks\/([0-9a-f-]{36})\/images$/.exec(url)) && req.method === 'POST') {
    const raw = await readBody(req);
    const body = JSON.parse(raw.toString('utf8'));
    const found = /^data:(image\/(?:jpeg|png|webp));base64,([A-Za-z0-9+/=]+)$/.exec(body.src || '');
    if (!found) return json(res, 422, { error: 'That is not a picture a deck can keep.' });
    const bytes = Buffer.from(found[2], 'base64');
    const slot = 'pic:' + crypto.createHash('sha256').update(bytes).digest('hex').slice(0, 32);
    pictures.set(slot, { mime: found[1], bytes });
    writes.push({ what: 'picture', bodyBytes: raw.length, slot });
    return json(res, 201, { slot, url: `/api/decks/${m[1]}/images/${encodeURIComponent(slot)}` });
  }
  if ((m = /^\/api\/decks\/([0-9a-f-]{36})\/images\/(.+)$/.exec(url)) && req.method === 'GET') {
    const pic = pictures.get(decodeURIComponent(m[2]));
    if (!pic) return false;
    res.writeHead(200, { 'Content-Type': pic.mime, 'Cache-Control': 'no-store' });
    res.end(pic.bytes);
    return true;
  }
  if ((m = /^\/api\/decks\/([0-9a-f-]{36})$/.exec(url))) {
    const id = m[1];
    if (req.method === 'PUT') {
      const raw = await readBody(req);
      const text = raw.toString('utf8');
      const body = JSON.parse(text);
      const had = saved.get(id);
      if (had && body.version !== had.version) {
        return json(res, 409, { error: `Saved by somebody else (you opened ${body.version}, it is ${had.version}).` });
      }
      const version = (had ? had.version : body.version) + 1;
      const at = new Date().toISOString();
      saved.set(id, { state: body.state, version, at, did: body.did || [] });
      writes.push({ what: 'save', bodyBytes: raw.length,
        inlinePictures: (text.match(/data:image\//g) || []).length, version, did: body.did });
      return json(res, 200, { version, updatedAt: at, by: 'Local check' });
    }
    if (req.method === 'GET') {
      const got = await live(url);
      const data = JSON.parse(got.body.toString('utf8'));
      const had = saved.get(id);
      if (had && data.deck) {
        data.deck.state = had.state;
        data.deck.version = had.version;
        data.deck.updatedAt = had.at;
        data.deck.updatedBy = 'Local check';
        data.deck.activity = [{ at: had.at, by: 'Local check', what: 'saved', did: had.did }]
          .concat(data.deck.activity || []);
      }
      if (data.deck) data.deck.canEdit = !reader;
      return json(res, got.status, data);
    }
  }
  return false;
}

http.createServer(async (req, res) => {
  const url = req.url || '/';
  try {
    if (/^\/deck\/[0-9a-fA-F-]{36}\/?(\?.*)?$/.test(url) || url.startsWith('/tools/concept-deck.html')) {
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' });
      fs.createReadStream(TOOL).pipe(res);
      return;
    }
    if (await editor(req, res, url)) return;
    if (req.method !== 'GET' && req.method !== 'HEAD') {
      json(res, 403, { error: 'The local check does not write to the live portal.' });
      return;
    }
    const up = https.request({ host: LIVE, path: url, method: req.method,
      headers: { accept: req.headers.accept || '*/*', 'user-agent': 'deck-local-check' } }, (r) => {
      const h = Object.assign({}, r.headers);
      delete h['content-security-policy']; delete h['strict-transport-security'];
      res.writeHead(r.statusCode || 502, h);
      r.pipe(res);
    });
    up.on('error', (e) => {
      if (!res.headersSent) res.writeHead(502);
      if (!res.writableEnded) res.end(String(e.message));
    });
    res.on('close', () => { if (!res.writableFinished) up.destroy(); });
    up.end();
  } catch (e) {
    if (!res.headersSent) res.writeHead(500, { 'Content-Type': 'text/plain' });
    if (!res.writableEnded) res.end(String((e && e.stack) || e));
  }
}).listen(PORT, () => console.log('deck editor check on http://localhost:' + PORT + ' using ' + TOOL));
