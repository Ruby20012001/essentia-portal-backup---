/* At phone width: how wide the reading page is, and whether giving the reading
   pane its full track (instead of fitting its content) brings it back to the screen. */
const sleep = (ms) => new Promise(r => setTimeout(r, ms));
const url = process.argv[2];
const t = await (await fetch('http://127.0.0.1:9333/json/list')).json();
const page = t.find(x => x.type === 'page');
const ws = new WebSocket(page.webSocketDebuggerUrl);
await new Promise((r, j) => { ws.addEventListener('open', r); ws.addEventListener('error', j); });
let id = 0; const w = new Map();
ws.addEventListener('message', (e) => { const m = JSON.parse(e.data); if (m.id && w.has(m.id)) { w.get(m.id)(m); w.delete(m.id); } });
const send = (method, params = {}) => new Promise(res => { id += 1; w.set(id, res); ws.send(JSON.stringify({ id, method, params })); });
const ev = async (x) => {
  const m = await send('Runtime.evaluate', { expression: x, returnByValue: true, awaitPromise: true });
  if (m.result?.exceptionDetails) return 'THREW ' + (m.result.exceptionDetails.exception?.description || '').slice(0, 300);
  return m.result?.result?.value;
};
await send('Page.enable'); await send('Network.enable'); await send('Network.clearBrowserCookies');
await send('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 2, mobile: true });
await send('Page.navigate', { url });
await sleep(14000);
console.log(await ev(`JSON.stringify((function () {
  var pane = document.getElementById('pane');
  var wrap = document.querySelector('#materials .deck-est-wrap');
  var read = function () {
    return { innerWidth: innerWidth, docW: document.documentElement.scrollWidth,
      paneW: Math.round(pane.getBoundingClientRect().width),
      wrapW: wrap ? Math.round(wrap.getBoundingClientRect().width) : null,
      tableW: wrap ? wrap.scrollWidth : null };
  };
  var before = read();
  pane.style.width = '100%';
  pane.style.minWidth = '0';
  void document.body.offsetWidth;
  return { before: before, after: read() };
})())`));
await send('Emulation.clearDeviceMetricsOverride');
ws.close();
