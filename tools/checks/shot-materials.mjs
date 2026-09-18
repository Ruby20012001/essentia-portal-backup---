import fs from 'node:fs';
const PORT = 9333; const sleep = (ms) => new Promise(r => setTimeout(r, ms));
const rpc = (ws) => { let id = 0; const w = new Map(); ws.addEventListener('message', (ev) => { const m = JSON.parse(ev.data); if (m.id && w.has(m.id)) { w.get(m.id)(m); w.delete(m.id); } }); return { send: (method, params) => new Promise(res => { id += 1; w.set(id, res); ws.send(JSON.stringify({ id, method, params })); }) }; };
const t = await (await fetch(`http://127.0.0.1:${PORT}/json/list`)).json();
const page = t.find(x => x.type === 'page');
const ws = new WebSocket(page.webSocketDebuggerUrl);
await new Promise((r, j) => { ws.addEventListener('open', r); ws.addEventListener('error', j); });
const cdp = rpc(ws);
const ev = async (x) => { const m = await cdp.send('Runtime.evaluate', { expression: x, returnByValue: true, awaitPromise: true }); if (m.result?.exceptionDetails) return 'THREW ' + JSON.stringify(m.result.exceptionDetails).slice(0, 300); return m.result?.result?.value; };
const [url, out, width = '1280', height = '900', dark = ''] = process.argv.slice(2);
await cdp.send('Page.enable', {});
await cdp.send('Network.clearBrowserCookies', {});
await cdp.send('Emulation.setDeviceMetricsOverride', { width: +width, height: +height, deviceScaleFactor: 1, mobile: +width < 700 });
await cdp.send('Page.navigate', { url });
await sleep(12000);
if (dark) { await ev(`document.getElementById('bLamp') && document.getElementById('bLamp').click()`); await sleep(800); }
const box = await ev(`(function(){var s=document.querySelector('#pane #materials'); if(!s) return null; s.scrollIntoView({block:'start'}); var r=s.getBoundingClientRect(); return JSON.stringify({x:r.left+scrollX,y:r.top+scrollY,w:r.width,h:r.height,painted:[].filter.call(s.querySelectorAll('img[data-swatch]'),function(i){return i.src.indexOf("data:image/jpeg")===0}).length});})()`);
console.log('section box:', box);
if (!box) { ws.close(); process.exit(1); }
const b = JSON.parse(box);
const shot = await cdp.send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: true, clip: { x: Math.max(0, b.x - 16), y: Math.max(0, b.y - 16), width: b.w + 32, height: b.h + 32, scale: 1 } });
fs.writeFileSync(out, Buffer.from(shot.result.data, 'base64'));
console.log('wrote', out);
await cdp.send('Emulation.clearDeviceMetricsOverride', {});
ws.close();
