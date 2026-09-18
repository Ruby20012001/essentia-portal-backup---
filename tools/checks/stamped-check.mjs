/* The stamped tool as Monica will open it — from disk: the build stamp shows,
   the Materials card is there, a 360 goes in through the space row, and it
   opens and turns. */
import path from 'node:path';
import fs from 'node:fs';
const [file, pano, shotOut] = process.argv.slice(2);
const sleep = (ms) => new Promise(r => setTimeout(r, ms));
const t = await (await fetch('http://127.0.0.1:9333/json/list')).json();
const page = t.find(x => x.type === 'page');
const ws = new WebSocket(page.webSocketDebuggerUrl);
await new Promise((r, j) => { ws.addEventListener('open', r); ws.addEventListener('error', j); });
let id = 0; const wait = new Map(); const events = []; const errors = [];
ws.addEventListener('message', (e) => {
  const m = JSON.parse(e.data);
  if (m.method) {
    events.push(m);
    if (m.method === 'Runtime.exceptionThrown') errors.push((m.params.exceptionDetails.exception?.description || m.params.exceptionDetails.text).slice(0, 200));
  }
  if (m.id && wait.has(m.id)) { wait.get(m.id)(m); wait.delete(m.id); }
});
const send = (method, params = {}) => new Promise(res => { id += 1; wait.set(id, res); ws.send(JSON.stringify({ id, method, params })); });
const ev = async (x, g) => {
  const m = await send('Runtime.evaluate', { expression: x, returnByValue: true, awaitPromise: true, userGesture: !!g });
  if (m.result?.exceptionDetails) throw new Error('page threw: ' + (m.result.exceptionDetails.exception?.description || '').slice(0, 300));
  return m.result?.result?.value;
};
const waitFor = async (expr, ms = 30000) => {
  const end = Date.now() + ms;
  while (Date.now() < end) { if (await ev(expr)) return true; await sleep(300); }
  throw new Error('timed out: ' + expr);
};
let failures = 0;
const check = (label, ok, detail) => { console.log((ok ? '  ok   ' : '  FAIL ') + label + (detail !== undefined ? '  → ' + JSON.stringify(detail) : '')); if (!ok) failures++; };

await send('Page.enable'); await send('Runtime.enable'); await send('DOM.enable');
await send('Page.setInterceptFileChooserDialog', { enabled: true });
await send('Emulation.setDeviceMetricsOverride', { width: 1440, height: 900, deviceScaleFactor: 1, mobile: false });
await send('Page.navigate', { url: 'file:///' + file.replace(/\\/g, '/') });
await waitFor(`!!(window.S && document.querySelector('#spaces [data-pano-drop]'))`);
await sleep(1500);
const head = await ev(`JSON.stringify({ stamp: /17Sep-\\d{4}/.test(document.body.innerText) ? document.body.innerText.match(/17Sep-\\d{4}/)[0] : null, materialsCard: !!document.getElementById('card-materials'), jump: !!document.querySelector('a[href="#card-materials"]') })`);
const h = JSON.parse(head);
check('the build stamp shows', !!h.stamp, h.stamp);
check('the Materials card is there', h.materialsCard && h.jump);

events.length = 0;
await ev(`document.querySelector('[data-pano-drop="0"]').click()`, true);
let opened = null;
for (let k = 0; k < 60 && !opened; k++) { opened = events.find(e => e.method === 'Page.fileChooserOpened'); await sleep(100); }
await send('DOM.setFileInputFiles', { files: [pano.replace(/\//g, '\\')], backendNodeId: opened.params.backendNodeId });
await waitFor(`(S.spaces[0].panos || []).length === 1`);
const sid = await ev(`String(S.spaces[0].id)`);
await ev(`document.querySelector('#pane .deck-card[data-space="${sid}"]').click()`, true);
await waitFor(`!!document.querySelector('#pane [data-sheet][data-open] .deck-hero-360')`);
await ev(`document.querySelector('#pane [data-sheet][data-open] .deck-hero-360').click()`, true);
await waitFor(`!!document.querySelector('.deck-pano[data-ready="1"]')`);
const a = await ev(`+document.querySelector('.deck-pano').getAttribute('data-yaw')`);
await send('Input.dispatchMouseEvent', { type: 'mousePressed', x: 720, y: 450, button: 'left', buttons: 1, clickCount: 1 });
for (let k = 1; k <= 12; k++) { await send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: 720 - 25 * k, y: 450, button: 'left', buttons: 1 }); await sleep(16); }
await send('Input.dispatchMouseEvent', { type: 'mouseReleased', x: 420, y: 450, button: 'left', buttons: 0, clickCount: 1 });
await sleep(1200);
const b = await ev(`JSON.stringify({ mode: document.querySelector('.deck-pano').getAttribute('data-mode'), yaw: +document.querySelector('.deck-pano').getAttribute('data-yaw') })`);
const bb = JSON.parse(b);
check('opened from disk, a 360 goes in, opens and turns', bb.mode === 'gl' && Math.abs(bb.yaw - a) > 10, { mode: bb.mode, from: a, to: bb.yaw });
if (shotOut) {
  const s = await send('Page.captureScreenshot', { format: 'png' });
  fs.writeFileSync(shotOut, Buffer.from(s.result.data, 'base64'));
}
/* the test room is taken out again, so nothing of it is left in the browser's draft */
await ev(`document.querySelector('.deck-pano [data-pano-close]').click(); S.spaces[0].panos = []; renderAll(); true`, true);
console.log('errors:', errors.length ? errors : 'none');
await send('Emulation.clearDeviceMetricsOverride');
ws.close();
console.log(failures ? `\n${failures} FAILED` : '\nall passed');
process.exit(failures ? 1 : 0);
