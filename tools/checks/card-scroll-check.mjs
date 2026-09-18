const sleep = (ms) => new Promise(r => setTimeout(r, ms));
const t = await (await fetch('http://127.0.0.1:9333/json/list')).json();
const page = t.find(x => x.type === 'page');
const ws = new WebSocket(page.webSocketDebuggerUrl);
await new Promise((r, j) => { ws.addEventListener('open', r); ws.addEventListener('error', j); });
let id = 0; const w = new Map();
ws.addEventListener('message', (e) => { const m = JSON.parse(e.data); if (m.id && w.has(m.id)) { w.get(m.id)(m); w.delete(m.id); } });
const send = (method, params = {}) => new Promise(res => { id += 1; w.set(id, res); ws.send(JSON.stringify({ id, method, params })); });
const ev = async (x) => (await send('Runtime.evaluate', { expression: x, returnByValue: true, awaitPromise: true })).result?.result?.value;
const cut = `[].filter.call(document.querySelectorAll('#matList img[data-swatch]'), function(i){ return (i.getAttribute('src')||'').indexOf('data:image/jpeg') === 0; }).length + ' of ' + document.querySelectorAll('#matList img[data-swatch]').length`;
console.log('before scrolling to the card:', await ev(cut));
await ev(`document.getElementById('card-materials').scrollIntoView({ block: 'start' }); true`);
for (let k = 0; k < 40; k++) { const v = await ev(cut); if (/^(\d+) of \1$/.test(v) && !/^0 of/.test(v)) break; await sleep(400); }
console.log('after scrolling to the card:', await ev(cut));
const trays = await ev(`[].filter.call(document.querySelectorAll('#spaces .tray-item img'), function(i){ return i.naturalWidth > 0; }).length + ' of ' + document.querySelectorAll('#spaces .tray-item img').length`);
console.log('tray pictures loaded so far (lazy):', trays);
ws.close();
