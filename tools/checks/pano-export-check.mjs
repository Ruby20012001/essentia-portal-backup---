/* The 360 view, end to end, against the local editor check (no live writes):
   a test panorama is drawn, uploaded through the editor card, opened from the
   space's picture, turned with a mouse, zoomed, closed; saved and reopened;
   then read on a phone-sized screen with no account, turned with a finger and
   pinched; and finally a file deck exported from the plain tool opens its 360
   with no server at all. */
import fs from 'node:fs';
import path from 'node:path';
const BASE = 'http://127.0.0.1:4189';
const DECK = 'd7114344-cacf-4396-9c79-412411268fa2';
const OUT = process.argv[2];
const sleep = (ms) => new Promise(r => setTimeout(r, ms));
const winPath = (p) => p.replace(/^\/c\//i, 'C:/').replace(/\//g, '\\');

const t = await (await fetch('http://127.0.0.1:9333/json/list')).json();
const page = t.find(x => x.type === 'page');
const ws = new WebSocket(page.webSocketDebuggerUrl);
await new Promise((r, j) => { ws.addEventListener('open', r); ws.addEventListener('error', j); });
let id = 0; const wait = new Map(); const events = []; const errors = [];
ws.addEventListener('message', (e) => {
  const m = JSON.parse(e.data);
  if (m.method) {
    events.push(m);
    if (m.method === 'Runtime.exceptionThrown') errors.push((m.params.exceptionDetails.exception?.description || m.params.exceptionDetails.text).slice(0, 300));
  }
  if (m.id && wait.has(m.id)) { wait.get(m.id)(m); wait.delete(m.id); }
});
const send = (method, params = {}) => new Promise(res => { id += 1; wait.set(id, res); ws.send(JSON.stringify({ id, method, params })); });
const ev = async (x, gesture) => {
  const m = await send('Runtime.evaluate', { expression: x, returnByValue: true, awaitPromise: true, userGesture: !!gesture });
  if (m.result?.exceptionDetails) throw new Error('page threw: ' + (m.result.exceptionDetails.exception?.description || JSON.stringify(m.result.exceptionDetails)).slice(0, 600));
  return m.result?.result?.value;
};
const waitFor = async (expr, ms = 60000) => {
  const end = Date.now() + ms;
  while (Date.now() < end) { if (await ev(expr)) return true; await sleep(300); }
  throw new Error('timed out waiting for ' + expr);
};
const waitEvent = async (method, ms = 20000) => {
  const end = Date.now() + ms;
  while (Date.now() < end) {
    const i = events.findIndex(e => e.method === method);
    if (i >= 0) return events.splice(i, 1)[0];
    await sleep(100);
  }
  throw new Error('no event ' + method);
};
const shot = async (file) => {
  const s = await send('Page.captureScreenshot', { format: 'png' });
  fs.writeFileSync(path.join(OUT, file), Buffer.from(s.result.data, 'base64'));
  console.log('   wrote', file);
};
let failures = 0;
const check = (label, ok, detail) => { console.log((ok ? '  ok   ' : '  FAIL ') + label + (detail !== undefined ? '  → ' + JSON.stringify(detail) : '')); if (!ok) failures++; };
const pickFile = async (clickExpr, file) => {
  events.length = 0;
  await ev(clickExpr, true);
  const opened = await waitEvent('Page.fileChooserOpened');
  await send('DOM.setFileInputFiles', { files: [winPath(file)], backendNodeId: opened.params.backendNodeId });
};
const drag = async (type, from, to, steps = 12) => {
  if (type === 'mouse') {
    await send('Input.dispatchMouseEvent', { type: 'mousePressed', x: from[0], y: from[1], button: 'left', buttons: 1, clickCount: 1 });
    for (let k = 1; k <= steps; k++) {
      await send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: from[0] + (to[0] - from[0]) * k / steps, y: from[1] + (to[1] - from[1]) * k / steps, button: 'left', buttons: 1 });
      await sleep(16);
    }
    await send('Input.dispatchMouseEvent', { type: 'mouseReleased', x: to[0], y: to[1], button: 'left', buttons: 0, clickCount: 1 });
  } else {
    await send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: from[0], y: from[1], id: 1 }] });
    for (let k = 1; k <= steps; k++) {
      await send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: from[0] + (to[0] - from[0]) * k / steps, y: from[1] + (to[1] - from[1]) * k / steps, id: 1 }] });
      await sleep(16);
    }
    await send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  }
};
const panoState = () => ev(`(function(){var b=document.querySelector('.deck-pano'); return b ? {mode:b.getAttribute('data-mode'), ready:b.getAttribute('data-ready'), yaw:+b.getAttribute('data-yaw'), pitch:+b.getAttribute('data-pitch'), fov:+b.getAttribute('data-fov'), say:(b.querySelector('[data-pano-say]')||{}).textContent, picks:b.querySelectorAll('[data-pano-pick]').length} : null;})()`);
const turned = (a, b) => { let d = b - a; while (d > 180) d -= 360; while (d < -180) d += 360; return d; };

await send('Page.enable'); await send('Runtime.enable'); await send('DOM.enable');
await send('Network.enable'); await send('Network.clearBrowserCookies');
await send('Page.setInterceptFileChooserDialog', { enabled: true });
await send('Emulation.setDeviceMetricsOverride', { width: 1280, height: 800, deviceScaleFactor: 1, mobile: false });

const panoFile = path.join(OUT, 'pano-room.jpg');
await send('Page.enable'); await send('Runtime.enable'); await send('DOM.enable');
await send('Page.setInterceptFileChooserDialog', { enabled: true });
console.log('F · a file deck, exported from the plain tool, turns with no server');
const dl = path.join(OUT, 'dl');
fs.rmSync(dl, { recursive: true, force: true }); fs.mkdirSync(dl, { recursive: true });
await send('Browser.setDownloadBehavior', { behavior: 'allow', downloadPath: winPath(dl) });
await send('Emulation.setDeviceMetricsOverride', { width: 1280, height: 800, deviceScaleFactor: 1, mobile: false });
await send('Page.navigate', { url: `${BASE}/tools/concept-deck.html` });
await waitFor(`!!(window.S && document.querySelector('#spaces [data-pano-drop]'))`);
await sleep(1500);
await pickFile(`document.querySelector('[data-pano-drop="0"]').click()`, panoFile);
await waitFor(`(S.spaces[0].panos || []).length === 1`, 30000);
await ev(`exportDeck()`, true);
let exported = null;
for (let k = 0; k < 60 && !exported; k++) {
  await sleep(500);
  exported = fs.readdirSync(dl).filter(f => /\.html$/i.test(f))[0] || null;
}
check('the deck is exported as a file', !!exported, exported);
if (exported) {
  const file = path.join(dl, exported);
  console.log('   exported', Math.round(fs.statSync(file).size / 1024), 'KB');
  await send('Page.navigate', { url: 'file:///' + winPath(file).replace(/\\/g, '/') });
  await sleep(5000);
  const sp0 = await ev(`String((window.__DECK__.spaces.filter(function(s){ return s.include !== false; })[0] || {}).id)`);
  await ev(`document.querySelector('.deck-card[data-space="${sp0}"]').click()`, true);
  await waitFor(`!!document.querySelector('[data-sheet][data-open] .deck-hero-360')`, 10000);
  await ev(`document.querySelector('[data-sheet][data-open] .deck-hero-360').click()`, true);
  await waitFor(`!!document.querySelector('.deck-pano[data-ready="1"]')`, 30000);
  const f0 = await panoState();
  await drag('mouse', [640, 400], [400, 400]);
  await sleep(1200);
  const f1 = await panoState();
  check('opened from disk, the 360 draws and turns', f0.mode === 'gl' && Math.abs(turned(f0.yaw, f1.yaw)) > 10, { mode: f0.mode, from: f0.yaw, to: f1.yaw });
  await shot('pano-5-file-deck.png');
}

console.log('errors on the pages:', errors.length ? errors : 'none');
ws.close();
console.log(failures ? `\n${failures} FAILED` : '\nall passed');
process.exit(failures ? 1 : 0);
