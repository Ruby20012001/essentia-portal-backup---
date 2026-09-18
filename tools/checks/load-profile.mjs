/* What opening a deck costs, from a cold cache: every request, its size, when
   it started and finished, and what asked for it — so the slow part is named
   rather than guessed. */
const url = process.argv[2];
const width = +(process.argv[3] || 1280), height = +(process.argv[4] || 900);
const seconds = +(process.argv[5] || 40);
const sleep = (ms) => new Promise(r => setTimeout(r, ms));
for (let k = 0; k < 20; k++) { try { await fetch('http://127.0.0.1:9333/json/version'); break; } catch (e) { await sleep(500); } }
const t = await (await fetch('http://127.0.0.1:9333/json/list')).json();
const page = t.find(x => x.type === 'page');
const ws = new WebSocket(page.webSocketDebuggerUrl);
await new Promise((r, j) => { ws.addEventListener('open', r); ws.addEventListener('error', j); });
let id = 0; const wait = new Map();
const reqs = new Map();
let t0 = 0;
ws.addEventListener('message', (e) => {
  const m = JSON.parse(e.data);
  if (m.id && wait.has(m.id)) { wait.get(m.id)(m); wait.delete(m.id); return; }
  const p = m.params || {};
  if (m.method === 'Network.requestWillBeSent') {
    if (!t0) t0 = p.timestamp;
    const init = p.initiator || {};
    const stack = init.stack && init.stack.callFrames && init.stack.callFrames[0];
    reqs.set(p.requestId, { url: p.request.url, type: p.type, start: p.timestamp - t0,
      by: init.type + (stack ? ':' + stack.functionName + '@' + stack.lineNumber : '') });
  } else if (m.method === 'Network.loadingFinished') {
    const r = reqs.get(p.requestId); if (r) { r.end = p.timestamp - t0; r.bytes = p.encodedDataLength; }
  } else if (m.method === 'Network.loadingFailed') {
    const r = reqs.get(p.requestId); if (r) { r.end = p.timestamp - t0; r.failed = p.errorText; }
  } else if (m.method === 'Network.responseReceived') {
    const r = reqs.get(p.requestId); if (r) { r.status = p.response.status; r.cache = (p.response.headers['x-vercel-cache'] || p.response.headers['X-Vercel-Cache'] || ''); r.enc = p.response.headers['content-encoding'] || ''; }
  }
});
const send = (method, params = {}) => new Promise(res => { id += 1; wait.set(id, res); ws.send(JSON.stringify({ id, method, params })); });
await send('Network.enable');
await send('Network.clearBrowserCache');
await send('Network.clearBrowserCookies');
await send('Network.setCacheDisabled', { cacheDisabled: true });
await send('Page.enable');
await send('Emulation.setDeviceMetricsOverride', { width, height, deviceScaleFactor: width < 700 ? 2 : 1, mobile: width < 700 });
await send('Page.navigate', { url });
await sleep(seconds * 1000);
const list = [...reqs.values()].filter(r => !/^data:/.test(r.url));
const kb = (b) => Math.round((b || 0) / 1024);
const short = (u) => u.replace(/^https?:\/\/[^/]+/, '').replace('/api/decks/d7114344-cacf-4396-9c79-412411268fa2', '/deck').slice(0, 70);
list.sort((a, b) => a.start - b.start);
for (const r of list) {
  console.log(`${r.start.toFixed(1).padStart(5)}s → ${r.end != null ? r.end.toFixed(1).padStart(5) + 's' : '  ...  '} ${String(kb(r.bytes)).padStart(5)} KB ${String(r.status || '').padEnd(3)} ${String(r.cache).padEnd(5)} ${(r.enc || '').padEnd(4)} ${short(r.url)}  [${r.by}]`);
}
const pics = list.filter(r => /\/images\//.test(r.url));
const done = list.filter(r => r.end != null);
console.log(`\nrequests ${list.length} · pictures ${pics.length} (${kb(pics.reduce((s, r) => s + (r.bytes || 0), 0))} KB) · all ${kb(done.reduce((s, r) => s + (r.bytes || 0), 0))} KB · last finished at ${Math.max(...done.map(r => r.end)).toFixed(1)}s · unfinished ${list.length - done.length}`);
const byInit = {};
for (const r of pics) { const k = r.by.replace(/@\d+$/, ''); byInit[k] = byInit[k] || { n: 0, kb: 0 }; byInit[k].n++; byInit[k].kb += kb(r.bytes); }
console.log('pictures by who asked:', JSON.stringify(byInit));
await send('Emulation.clearDeviceMetricsOverride');
ws.close();
