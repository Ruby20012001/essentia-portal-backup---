/* "Save as PDF" for one room, and for the whole deck: the printer is only
   called once the printed pages have their pictures. window.print is replaced
   by a recorder so no dialog opens. */
const url = process.argv[2];
const sleep = (ms) => new Promise(r => setTimeout(r, ms));
const t = await (await fetch('http://127.0.0.1:9333/json/list')).json();
const page = t.find(x => x.type === 'page');
const ws = new WebSocket(page.webSocketDebuggerUrl);
await new Promise((r, j) => { ws.addEventListener('open', r); ws.addEventListener('error', j); });
let id = 0; const wait = new Map(); const errors = [];
ws.addEventListener('message', (e) => {
  const m = JSON.parse(e.data);
  if (m.method === 'Runtime.exceptionThrown') errors.push((m.params.exceptionDetails.exception?.description || '').slice(0, 200));
  if (m.id && wait.has(m.id)) { wait.get(m.id)(m); wait.delete(m.id); }
});
const send = (method, params = {}) => new Promise(res => { id += 1; wait.set(id, res); ws.send(JSON.stringify({ id, method, params })); });
const ev = async (x, g) => (await send('Runtime.evaluate', { expression: x, returnByValue: true, awaitPromise: true, userGesture: !!g })).result?.result?.value;
let failures = 0;
const check = (label, ok, detail) => { console.log((ok ? '  ok   ' : '  FAIL ') + label + (detail !== undefined ? '  → ' + JSON.stringify(detail) : '')); if (!ok) failures++; };
await send('Runtime.enable'); await send('Page.enable'); await send('Network.clearBrowserCookies');
await send('Emulation.setDeviceMetricsOverride', { width: 1280, height: 900, deviceScaleFactor: 1, mobile: false });
await send('Page.navigate', { url });
await sleep(20000);
await ev(`window.__printed = []; window.print = function () {
  var target = document.documentElement.classList.contains('print-one') ? document.querySelector('.deck-print-space.print-target') : null;
  var scope = target || document;
  var imgs = scope.querySelectorAll('.deck-print-space img, img[data-print-src]');
  window.__printed.push({ one: !!target, waiting: scope.querySelectorAll('img[data-print-src]').length,
    loaded: [].filter.call(scope.querySelectorAll('.deck-print-space img'), function (i) { return i.naturalWidth > 0; }).length,
    total: imgs.length });
}; true`);
check('printed pages wait for printing', await ev(`document.querySelectorAll('.deck-print-space img[data-print-src]').length`) === 26);

/* one room: kitchen, which has two renders */
await ev(`document.querySelector('#pane .deck-card[data-space="ireo2"]').click()`, true);
await sleep(1200);
await ev(`document.querySelector('#pane [data-sheet][data-open] [data-pdf-one]').click()`, true);
for (let k = 0; k < 40; k++) { if ((await ev(`window.__printed.length`)) > 0) break; await sleep(250); }
const one = await ev(`JSON.stringify(window.__printed[0] || null)`);
const o = JSON.parse(one);
check('one room: the printer is called with that room\'s pictures in', o && o.one && o.waiting === 0 && o.loaded === o.total && o.total >= 2, o);

/* the whole deck */
await sleep(500);
await ev(`window.__printed = []; document.documentElement.classList.remove('print-one'); [].forEach.call(document.querySelectorAll('.print-target'), function (n) { n.classList.remove('print-target'); }); true`);
await ev(`document.querySelector('#pane [data-sheet][data-open] [data-pdf-all]').click()`, true);
for (let k = 0; k < 80; k++) { if ((await ev(`window.__printed.length`)) > 0) break; await sleep(250); }
const all = JSON.parse(await ev(`JSON.stringify(window.__printed[0] || null)`));
check('whole deck: the printer is called once every printed picture is in', all && all.waiting === 0 && all.loaded === all.total && all.total >= 26, all);

/* a drawing opened big from the room still opens */
console.log('errors:', errors.length ? errors : 'none');
await send('Emulation.clearDeviceMetricsOverride');
ws.close();
console.log(failures ? `\n${failures} FAILED` : '\nall passed');
process.exit(failures ? 1 : 0);
