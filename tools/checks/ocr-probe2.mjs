const t = await (await fetch('http://127.0.0.1:9333/json/list')).json();
const page = t.find(x => x.type === 'page');
const ws = new WebSocket(page.webSocketDebuggerUrl);
await new Promise((r, j) => { ws.addEventListener('open', r); ws.addEventListener('error', j); });
let id = 0; const w = new Map(); const logs = [];
ws.addEventListener('message', (e) => { const m = JSON.parse(e.data);
  if (m.method === 'Runtime.consoleAPICalled') logs.push(m.params.type + ': ' + m.params.args.map(a => a.value || a.description).join(' ').slice(0, 200));
  if (m.method === 'Runtime.exceptionThrown') logs.push('EXC ' + JSON.stringify(m.params.exceptionDetails).slice(0, 300));
  if (m.id && w.has(m.id)) { w.get(m.id)(m); w.delete(m.id); } });
const send = (method, params = {}) => new Promise(res => { id += 1; w.set(id, res); ws.send(JSON.stringify({ id, method, params })); });
await send('Runtime.enable');
const m = await send('Runtime.evaluate', { returnByValue: true, awaitPromise: true, expression: `(async function(){
  var steps = [];
  try {
    var worker = await Tesseract.createWorker('eng', 1, {
      workerPath: 'https://cdn.jsdelivr.net/npm/tesseract.js@5.1.1/dist/worker.min.js',
      corePath: 'https://cdn.jsdelivr.net/npm/tesseract.js-core@5.1.1',
      langPath: 'https://cdn.jsdelivr.net/npm/@tesseract.js-data/eng@1.0.0/4.0.0_best_int',
      logger: function (m) { if (m.status !== 'recognizing text') console.log('tess', m.status, Math.round((m.progress||0)*100)); },
      errorHandler: function (e) { console.log('tess error', String(e)); }
    });
    steps.push('worker ok');
    await worker.terminate();
  } catch (e) { steps.push('failed: ' + (e && (e.message || e.type || String(e)))); }
  return steps.join(' | ');
})()` });
console.log(m.result.result.value || JSON.stringify(m.result).slice(0, 400));
console.log(logs.slice(-12).join('\n'));
ws.close();
