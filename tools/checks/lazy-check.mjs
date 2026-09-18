/* Opening the deck fetches only the pictures on show; the materials swatches
   are cut when their rows come near the screen — and still all get cut. */
import fs from 'node:fs';
const url = process.argv[2], shotOut = process.argv[3];
const sleep = (ms) => new Promise(r => setTimeout(r, ms));
const t = await (await fetch('http://127.0.0.1:9333/json/list')).json();
const page = t.find(x => x.type === 'page');
const ws = new WebSocket(page.webSocketDebuggerUrl);
await new Promise((r, j) => { ws.addEventListener('open', r); ws.addEventListener('error', j); });
let id = 0; const wait = new Map(); const pics = []; const errors = [];
ws.addEventListener('message', (e) => {
  const m = JSON.parse(e.data);
  if (m.id && wait.has(m.id)) { wait.get(m.id)(m); wait.delete(m.id); return; }
  if (m.method === 'Network.requestWillBeSent' && /\/images\//.test(m.params.request.url)) pics.push(decodeURIComponent(m.params.request.url.split('/images/')[1]));
  if (m.method === 'Runtime.exceptionThrown') errors.push((m.params.exceptionDetails.exception?.description || '').slice(0, 200));
});
const send = (method, params = {}) => new Promise(res => { id += 1; wait.set(id, res); ws.send(JSON.stringify({ id, method, params })); });
const ev = async (x) => (await send('Runtime.evaluate', { expression: x, returnByValue: true, awaitPromise: true })).result?.result?.value;
await send('Network.enable'); await send('Runtime.enable'); await send('Page.enable');
await send('Network.clearBrowserCache'); await send('Network.clearBrowserCookies');
await send('Network.setCacheDisabled', { cacheDisabled: false });
await send('Emulation.setDeviceMetricsOverride', { width: 1280, height: 900, deviceScaleFactor: 1, mobile: false });
await send('Page.navigate', { url });
await sleep(25000);
const atOpen = pics.slice();
const painted0 = await ev(`[].filter.call(document.querySelectorAll('#pane img[data-swatch]'), function(i){ return (i.getAttribute('src')||'').indexOf('data:image/jpeg') === 0; }).length`);
console.log('on opening:', atOpen.length, 'pictures —', atOpen.join(', '));
console.log('swatches cut before scrolling:', painted0);
await ev(`document.querySelector('#pane #materials').scrollIntoView({ block: 'start' }); true`);
for (let k = 0; k < 60; k++) {
  const n = await ev(`[].filter.call(document.querySelectorAll('#pane img[data-swatch]'), function(i){ return (i.getAttribute('src')||'').indexOf('data:image/jpeg') === 0; }).length`);
  if (n >= 8) break;
  await sleep(500);
}
const painted1 = await ev(`[].filter.call(document.querySelectorAll('#pane img[data-swatch]'), function(i){ return (i.getAttribute('src')||'').indexOf('data:image/jpeg') === 0; }).length + ' of ' + document.querySelectorAll('#pane img[data-swatch]').length`);
const extra = pics.slice(atOpen.length);
console.log('after scrolling to the materials:', painted1, 'cut ·', extra.length, 'more pictures —', extra.join(', '));
if (shotOut) {
  await sleep(500);
  const box = JSON.parse(await ev(`(function(){ var s = document.querySelector('#pane #materials'); var r = s.getBoundingClientRect(); return JSON.stringify({ x: r.left + scrollX, y: r.top + scrollY, w: r.width, h: r.height }); })()`));
  const shot = await send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: true, clip: { x: box.x - 16, y: box.y - 16, width: box.w + 32, height: box.h + 32, scale: 1 } });
  fs.writeFileSync(shotOut, Buffer.from(shot.result.data, 'base64'));
}
console.log('errors:', errors.length ? errors : 'none');
await send('Emulation.clearDeviceMetricsOverride');
ws.close();
