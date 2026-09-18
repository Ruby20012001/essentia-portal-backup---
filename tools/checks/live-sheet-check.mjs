/* The live IREO deck, signed out: a room opens, the 360 code is there, a
   reader is offered no way to add one, and nothing on the page throws. */
const sleep = (ms) => new Promise(r => setTimeout(r, ms));
const t = await (await fetch('http://127.0.0.1:9333/json/list')).json();
const page = t.find(x => x.type === 'page');
const ws = new WebSocket(page.webSocketDebuggerUrl);
await new Promise((r, j) => { ws.addEventListener('open', r); ws.addEventListener('error', j); });
let id = 0; const wait = new Map(); const errors = [];
ws.addEventListener('message', (e) => {
  const m = JSON.parse(e.data);
  if (m.method === 'Runtime.exceptionThrown') errors.push((m.params.exceptionDetails.exception?.description || m.params.exceptionDetails.text).slice(0, 200));
  if (m.id && wait.has(m.id)) { wait.get(m.id)(m); wait.delete(m.id); }
});
const send = (method, params = {}) => new Promise(res => { id += 1; wait.set(id, res); ws.send(JSON.stringify({ id, method, params })); });
const ev = async (x, g) => {
  const m = await send('Runtime.evaluate', { expression: x, returnByValue: true, awaitPromise: true, userGesture: !!g });
  if (m.result?.exceptionDetails) return 'THREW ' + (m.result.exceptionDetails.exception?.description || '').slice(0, 200);
  return m.result?.result?.value;
};
await send('Page.enable'); await send('Runtime.enable'); await send('Network.enable');
await send('Network.clearBrowserCookies');
await send('Network.setCacheDisabled', { cacheDisabled: true });
await send('Emulation.setDeviceMetricsOverride', { width: 1280, height: 900, deviceScaleFactor: 1, mobile: false });
await send('Page.navigate', { url: 'https://essentia-portal-backup-w6xi.vercel.app/deck/d7114344-cacf-4396-9c79-412411268fa2' });
await sleep(18000);
await ev(`document.querySelector('#pane .deck-card[data-space="ireo2"]').click()`, true);
await sleep(2000);
console.log(await ev(`JSON.stringify({
  reading: document.body.classList.contains('is-reading'),
  locked: document.body.classList.contains('deck-locked'),
  importPano: typeof window.EssentiaDeck.importPano,
  sheetOpen: !!document.querySelector('#pane [data-sheet][data-open]'),
  room: (document.querySelector('#pane [data-sheet][data-open] h3') || {}).textContent,
  hero360: document.querySelectorAll('#pane [data-sheet][data-open] .deck-hero-360').length,
  badges: document.querySelectorAll('#pane .deck-card-360').length,
  addPanoShown: [].filter.call(document.querySelectorAll('#pane [data-sheet][data-open] [data-add-pano]'), function (b) { return getComputedStyle(b).display !== 'none'; }).length,
  addPicturesShown: [].filter.call(document.querySelectorAll('#pane [data-sheet][data-open] [data-add-space]'), function (b) { return getComputedStyle(b).display !== 'none'; }).length
})`));
console.log('errors:', errors.length ? errors : 'none');
await send('Emulation.clearDeviceMetricsOverride');
ws.close();
