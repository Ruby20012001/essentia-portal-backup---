/* Can the words on IREO's plan be read in the browser? Tesseract.js from the
   CDN, on the plan as the deck serves it, at 1× and 2×; every word with its
   box and confidence is written out for a look. Reads only. */
import fs from 'node:fs';
const [pageUrl, imgPath, outJson, scaleArg] = process.argv.slice(2);
const scale = +(scaleArg || 2);
const sleep = (ms) => new Promise(r => setTimeout(r, ms));
for (let k = 0; k < 30; k++) { try { await fetch('http://127.0.0.1:9333/json/version'); break; } catch (e) { await sleep(500); } }
const t = await (await fetch('http://127.0.0.1:9333/json/list')).json();
const page = t.find(x => x.type === 'page');
const ws = new WebSocket(page.webSocketDebuggerUrl);
await new Promise((r, j) => { ws.addEventListener('open', r); ws.addEventListener('error', j); });
let id = 0; const wait = new Map(); const logs = [];
ws.addEventListener('message', (e) => {
  const m = JSON.parse(e.data);
  if (m.method === 'Runtime.consoleAPICalled') logs.push(m.params.args.map(a => a.value).join(' '));
  if (m.method === 'Runtime.exceptionThrown') logs.push('EXC ' + (m.params.exceptionDetails.exception?.description || '').slice(0, 300));
  if (m.id && wait.has(m.id)) { wait.get(m.id)(m); wait.delete(m.id); }
});
const send = (method, params = {}) => new Promise(res => { id += 1; wait.set(id, res); ws.send(JSON.stringify({ id, method, params })); });
const ev = async (x) => {
  const m = await send('Runtime.evaluate', { expression: x, returnByValue: true, awaitPromise: true, timeout: 600000 });
  if (m.result?.exceptionDetails) return 'THREW ' + (m.result.exceptionDetails.exception?.description || JSON.stringify(m.result.exceptionDetails)).slice(0, 500);
  return m.result?.result?.value;
};
await send('Runtime.enable'); await send('Page.enable');
await send('Page.navigate', { url: pageUrl });
await sleep(6000);
const t0 = Date.now();
const res = await ev(`(async function () {
  await new Promise(function (ok, no) {
    var s = document.createElement('script');
    s.src = 'https://cdn.jsdelivr.net/npm/tesseract.js@5.1.1/dist/tesseract.min.js';
    s.onload = ok; s.onerror = function () { no(new Error('no tesseract')); };
    document.head.appendChild(s);
  });
  var img = await new Promise(function (ok, no) { var i = new Image(); i.onload = function () { ok(i); }; i.onerror = no; i.src = ${JSON.stringify(imgPath)}; });
  var W = img.naturalWidth * ${scale}, H = img.naturalHeight * ${scale};
  var c = document.createElement('canvas'); c.width = W; c.height = H;
  var g = c.getContext('2d'); g.fillStyle = '#fff'; g.fillRect(0, 0, W, H);
  g.imageSmoothingQuality = 'high'; g.drawImage(img, 0, 0, W, H);
  var worker = await Tesseract.createWorker('eng', 1, {
    workerPath: 'https://cdn.jsdelivr.net/npm/tesseract.js@5.1.1/dist/worker.min.js',
    corePath: 'https://cdn.jsdelivr.net/npm/tesseract.js-core@5.1.1',
    langPath: 'https://cdn.jsdelivr.net/npm/@tesseract.js-data/eng@1.0.0/4.0.0_best_int'
  });
  await worker.setParameters({ tessedit_pageseg_mode: '11' });
  var r = await worker.recognize(c);
  await worker.terminate();
  return JSON.stringify({ w: img.naturalWidth, h: img.naturalHeight, scale: ${scale},
    words: r.data.words.map(function (wd) { return { t: wd.text, c: Math.round(wd.confidence), x0: wd.bbox.x0 / ${scale}, y0: wd.bbox.y0 / ${scale}, x1: wd.bbox.x1 / ${scale}, y1: wd.bbox.y1 / ${scale} }; }) });
})()`);
const secs = ((Date.now() - t0) / 1000).toFixed(1);
if (typeof res !== 'string' || res.startsWith('THREW')) { console.log('failed:', res, logs.slice(-5)); process.exit(1); }
fs.writeFileSync(outJson, res);
const d = JSON.parse(res);
console.log(`plan ${d.w}×${d.h} at ${d.scale}× · ${d.words.length} words · ${secs}s`);
console.log(d.words.filter(w => w.c >= 50 && /[a-z]{3,}/i.test(w.t)).map(w => `${w.t}(${w.c})`).join(' '));
ws.close();
