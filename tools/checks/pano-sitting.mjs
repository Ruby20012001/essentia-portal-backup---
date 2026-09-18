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

console.log('0 · a test panorama: a room, drawn straight into 360');
await send('Page.navigate', { url: BASE + '/__writes' });
await sleep(1500);
const made = await ev(`(function(){
  var c = document.createElement('canvas'); c.width = 4096; c.height = 2048;
  var gl = c.getContext('webgl', { preserveDrawingBuffer: true });
  if (!gl) return { error: 'no webgl' };
  function sh(t, src){ var s = gl.createShader(t); gl.shaderSource(s, src); gl.compileShader(s); if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(s)); return s; }
  var vs = 'attribute vec2 p;varying vec2 v;void main(){v=p;gl_Position=vec4(p,0.,1.);}';
  var fs = [
    'precision highp float; varying vec2 v;',
    'void main(){',
    ' float lon = v.x * 3.14159265; float lat = v.y * 1.57079633;',
    ' vec3 d = vec3(sin(lon)*cos(lat), sin(lat), -cos(lon)*cos(lat));',
    ' vec3 o = vec3(0.0, 1.5, 0.0); vec3 lo = vec3(-2.5, 0.0, -2.0); vec3 hi = vec3(2.5, 3.0, 2.0);',
    ' vec3 inv = 1.0 / d; vec3 t1 = (lo - o) * inv; vec3 t2 = (hi - o) * inv; vec3 tm = max(t1, t2);',
    ' float t = min(min(tm.x, tm.y), tm.z); vec3 q = o + d * t; vec3 col;',
    ' if (t == tm.y) {',
    '   if (d.y < 0.0) { vec2 g = fract(q.xz / 0.6); col = mix(vec3(0.84,0.78,0.68), vec3(0.55,0.50,0.44), step(0.965, max(g.x, g.y))); }',
    '   else { col = mix(vec3(1.0,0.93,0.70), vec3(0.96,0.95,0.93), smoothstep(0.18, 0.24, length(q.xz))); }',
    ' } else if (t == tm.z) {',
    '   if (d.z < 0.0) { col = vec3(0.88,0.85,0.80); if (abs(q.x) < 1.1 && q.y > 0.8 && q.y < 2.5) { col = vec3(0.60,0.77,0.93); if (abs(q.x) < 0.03 || abs(q.y - 1.65) < 0.03) col = vec3(0.95); } }',
    '   else { col = vec3(0.80,0.76,0.71); if (q.x > 0.5 && q.x < 1.5 && q.y < 2.1) col = vec3(0.47,0.32,0.21); }',
    ' } else {',
    '   if (d.x < 0.0) { col = vec3(0.74,0.81,0.77); if (abs(q.z) < 0.8 && q.y > 1.1 && q.y < 2.2) col = vec3(0.78,0.38,0.27); }',
    '   else { col = vec3(0.85,0.79,0.73); if (abs(q.z) < 1.3 && q.y < 0.85) col = vec3(0.30,0.34,0.40); }',
    ' }',
    ' if (t != tm.y && q.y < 0.12) col *= 0.62;',
    ' gl_FragColor = vec4(col, 1.0);',
    '}'].join('\\n');
  var pr = gl.createProgram(); gl.attachShader(pr, sh(gl.VERTEX_SHADER, vs)); gl.attachShader(pr, sh(gl.FRAGMENT_SHADER, fs)); gl.linkProgram(pr); gl.useProgram(pr);
  gl.bindBuffer(gl.ARRAY_BUFFER, gl.createBuffer()); gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1,-1,3,-1,-1,3]), gl.STATIC_DRAW);
  var a = gl.getAttribLocation(pr, 'p'); gl.enableVertexAttribArray(a); gl.vertexAttribPointer(a, 2, gl.FLOAT, false, 0, 0);
  gl.viewport(0, 0, 4096, 2048); gl.drawArrays(gl.TRIANGLES, 0, 3);
  var pano = c.toDataURL('image/jpeg', 0.9);
  var f = document.createElement('canvas'); f.width = 1500; f.height = 1000; var x = f.getContext('2d');
  x.fillStyle = '#c9b79c'; x.fillRect(0, 0, 1500, 1000);
  return { pano: pano, flat: f.toDataURL('image/jpeg', 0.9) };
})()`);
if (!made || made.error) throw new Error('could not draw the test panorama: ' + JSON.stringify(made && made.error));
const panoFile = path.join(OUT, 'pano-room.jpg'), flatFile = path.join(OUT, 'not-a-pano.jpg');
fs.writeFileSync(panoFile, Buffer.from(made.pano.split(',')[1], 'base64'));
fs.writeFileSync(flatFile, Buffer.from(made.flat.split(',')[1], 'base64'));
console.log('   panorama', Math.round(fs.statSync(panoFile).size / 1024), 'KB');

console.log('A · the editor card takes a 360 and refuses what is not one');
await send('Page.navigate', { url: `${BASE}/deck/${DECK}` });
await waitFor(`!!(window.S && window.PORTAL && PORTAL.version && document.querySelector('#spaces [data-pano-drop]'))`);
await sleep(2500);
const kitchen = await ev(`(function(){ for (var i=0;i<S.spaces.length;i++) if (S.spaces[i].name === 'kitchen') return { i: i, id: String(S.spaces[i].id) }; return null; })()`);
check('the kitchen is there to hold a 360', !!kitchen, kitchen);
await pickFile(`document.querySelector('[data-pano-drop="${kitchen.i}"]').click()`, flatFile);
await waitFor(`/not a 360 view/.test((document.getElementById('toast')||{}).textContent || '')`, 20000).catch(() => {});
const refused = await ev(`({ toast: (document.getElementById('toast')||{}).textContent, panos: (S.spaces[${kitchen.i}].panos || []).length })`);
check('a 1500 × 1000 picture is refused, with what to do instead', /not a 360 view/.test(refused.toast) && refused.panos === 0, refused.toast);
await pickFile(`document.querySelector('[data-pano-drop="${kitchen.i}"]').click()`, panoFile);
await waitFor(`(S.spaces[${kitchen.i}].panos || []).length === 1`, 30000);
const taken = await ev(`(function(){ var p = S.spaces[${kitchen.i}].panos[0]; return { w: p.w, h: p.h, kb: Math.round(p.src.length * 3 / 4 / 1024), toast: document.getElementById('toast').textContent, pill: !!document.querySelector('[data-space-row="${kitchen.i}"] .pill--ok') && /360/.test(document.querySelector('[data-space-row="${kitchen.i}"] .row-tools').textContent) }; })()`);
check('kept at 4096 × 2048, small enough to send', taken.w === 4096 && taken.h === 2048 && taken.kb < 2700, taken);
check('the row says 360', taken.pill, taken.toast);

console.log('B · the button on the picture opens it, and it turns');
await ev(`document.querySelector('#pane .deck-card[data-space="${kitchen.id}"]').click()`, true);
await waitFor(`!!document.querySelector('#pane [data-sheet][data-open] .deck-hero-360')`, 10000);
check('the grid card carries a 360 badge', await ev(`!!document.querySelector('#pane .deck-card[data-space="${kitchen.id}"] .deck-card-360')`));
await ev(`(function(){
  window.__closeStack = [];
  var orig = Element.prototype.removeAttribute;
  Element.prototype.removeAttribute = function (n) {
    if (n === 'data-open' && this.hasAttribute('data-sheet')) window.__closeStack.push(Math.round(performance.now()) + ' removeAttribute ' + new Error().stack.split('\\n').slice(1, 6).join(' | '));
    return orig.call(this, n);
  };
  var pane = document.querySelector('#pane');
  var desc = Object.getOwnPropertyDescriptor(Element.prototype, 'innerHTML');
  Object.defineProperty(pane, 'innerHTML', { configurable: true, get: function(){ return desc.get.call(this); }, set: function (v) { window.__closeStack.push(Math.round(performance.now()) + ' pane.innerHTML ' + new Error().stack.split('\\n').slice(1, 7).join(' | ')); desc.set.call(this, v); } });
  return true;
})()`);
await ev(`document.querySelector('#pane [data-sheet][data-open] .deck-hero-360').click()`, true);
await waitFor(`!!document.querySelector('.deck-pano[data-ready="1"]')`, 30000);
await sleep(1200);
let st = await panoState();
check('it opens full screen, drawn by WebGL', st && st.mode === 'gl' && st.ready === '1', st);
await shot('pano-1-open.png');
const before = st;
await drag('mouse', [640, 400], [340, 400]);
await sleep(1500);
st = await panoState();
check('dragging left turns the room to the right', turned(before.yaw, st.yaw) > 15 && turned(before.yaw, st.yaw) < 120, { from: before.yaw, to: st.yaw });
const p0 = st.pitch;
await drag('mouse', [640, 350], [640, 500]);
await sleep(1200);
st = await panoState();
check('dragging down looks up', st.pitch - p0 > 8, { from: p0, to: st.pitch });
await send('Input.dispatchMouseEvent', { type: 'mouseWheel', x: 640, y: 400, deltaX: 0, deltaY: -400 });
await sleep(600);
st = await panoState();
check('scrolling goes closer', st.fov < 60, st.fov);
await shot('pano-2-turned.png');
await send('Input.dispatchKeyEvent', { type: 'keyDown', key: 'Escape', code: 'Escape', windowsVirtualKeyCode: 27 });
await send('Input.dispatchKeyEvent', { type: 'keyUp', key: 'Escape', code: 'Escape', windowsVirtualKeyCode: 27 });
await sleep(400);
check('Escape closes the 360 and leaves the space open', await ev(`!document.querySelector('.deck-pano') && !!document.querySelector('#pane [data-sheet][data-open]')`));

console.log('C · a second 360, added from the space itself');
await sleep(1500);
const stillOpen = await ev(`JSON.stringify({ sheet: !!document.querySelector('#pane [data-sheet][data-open]'), active: document.activeElement && document.activeElement.className, pano: !!document.querySelector('.deck-pano') })`);
console.log('   before C:', stillOpen);
await sleep(1500);
console.log('   closes seen:', await ev(`JSON.stringify(window.__closeStack, null, 1)`));
console.log('   sheet now:', await ev(`!!document.querySelector('#pane [data-sheet][data-open]')`));
if (!JSON.parse(stillOpen).sheet) {
  await ev(`document.querySelector('#pane .deck-card[data-space="${kitchen.id}"]').click()`, true);
  await waitFor(`!!document.querySelector('#pane [data-sheet][data-open] [data-add-pano]')`, 10000);
}
await pickFile(`document.querySelector('#pane [data-sheet][data-open] [data-add-pano]').click()`, panoFile);
await waitFor(`(S.spaces[${kitchen.i}].panos || []).length === 2`, 30000);
await sleep(800);
await ev(`document.querySelector('#pane [data-sheet][data-open] .deck-hero-360').click()`, true);
await waitFor(`!!document.querySelector('.deck-pano[data-ready="1"]')`, 30000);
st = await panoState();
check('two views, a choice between them', st.picks === 2, st.picks);
await ev(`document.querySelector('.deck-pano [data-pano-pick="1"]').click()`, true);
await waitFor(`!!document.querySelector('.deck-pano[data-ready="1"]') && document.querySelector('.deck-pano [data-pano-pick="1"]').getAttribute('aria-current') === 'true'`, 30000);
check('the second one opens', true);
await ev(`document.querySelector('.deck-pano [data-pano-close]').click()`, true);
await sleep(300);
check('Close closes it', await ev(`!document.querySelector('.deck-pano')`));

console.log('D · save, and open again');
await ev(`document.getElementById('bBackup').click()`, true);
await waitFor(`window.PORTAL && PORTAL.busy === false && /Saved|Not saved|Somebody/.test((document.getElementById('backupState')||{}).textContent||'')`, 120000);
const w = await ev(`fetch('/__writes').then(function(r){return r.json();})`);
const ups = w.filter(x => x.what === 'picture'), saves = w.filter(x => x.what === 'save');
check('the 360 went up on its own (the same picture twice, sent once)', ups.length === 1 && ups[0].bodyBytes < 4.5 * 1024 * 1024, ups.map(u => Math.round(u.bodyBytes / 1024) + ' KB'));
check('the save stayed light', saves.length === 1 && saves[0].bodyBytes < 400 * 1024 && saves[0].inlinePictures <= 1, saves.map(s => ({ kb: Math.round(s.bodyBytes / 1024), inline: s.inlinePictures, did: s.did })));
check('the activity says so', saves[0] && (saves[0].did || []).some(d => /360° view/.test(d)), saves[0] && saves[0].did);
await send('Page.navigate', { url: `${BASE}/deck/${DECK}` });
await waitFor(`!!(window.S && window.PORTAL && PORTAL.version && document.querySelector('#pane .deck-card'))`);
await sleep(2000);
const back = await ev(`(function(){ var sp = S.spaces[${kitchen.i}]; return { n: (sp.panos||[]).length, src: sp.panos && sp.panos[0] && sp.panos[0].src.slice(0, 60) }; })()`);
check('after a reload the kitchen still has both, from the picture route', back.n === 2 && /^\/api\/decks\//.test(back.src), back);
await ev(`document.querySelector('#pane .deck-card[data-space="${kitchen.id}"]').click()`, true);
await waitFor(`!!document.querySelector('#pane [data-sheet][data-open] .deck-hero-360')`, 10000);
await ev(`document.querySelector('#pane [data-sheet][data-open] .deck-hero-360').click()`, true);
await waitFor(`!!document.querySelector('.deck-pano[data-ready="1"]')`, 30000);
check('and it opens from there', (await panoState()).ready === '1');
await ev(`document.querySelector('.deck-pano [data-pano-close]').click()`, true);

console.log('E · a phone, no account: tap, turn with a finger, pinch');
await send('Network.setCookie', { name: 'reader', value: '1', url: BASE });
await send('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 2, mobile: true });
await send('Emulation.setTouchEmulationEnabled', { enabled: true, maxTouchPoints: 5 });
await send('Page.navigate', { url: `${BASE}/deck/${DECK}` });
await waitFor(`!!(window.S && window.PORTAL && PORTAL.version && document.body.classList.contains('is-reading') && document.querySelector('#pane .deck-card'))`);
await sleep(2000);
await ev(`document.querySelector('#pane .deck-card[data-space="${kitchen.id}"]').click()`, true);
await waitFor(`!!document.querySelector('#pane [data-sheet][data-open] .deck-hero-360')`, 10000);
const reader = await ev(`(function(){ var add = document.querySelector('#pane [data-sheet][data-open] [data-add-pano]'); return { locked: document.body.classList.contains('deck-locked'), addShown: !!add && getComputedStyle(add).display !== 'none' }; })()`);
check('a reader sees the 360 button but no way to add one', reader.locked && !reader.addShown, reader);
await sleep(600);
await shot('pano-3-phone-space.png');
await ev(`document.querySelector('#pane [data-sheet][data-open] .deck-hero-360').click()`, true);
await waitFor(`!!document.querySelector('.deck-pano[data-ready="1"]')`, 30000);
await sleep(1000);
const m0 = await panoState();
await drag('touch', [300, 420], [80, 420]);
await sleep(1500);
const m1 = await panoState();
check('a finger turns it', Math.abs(turned(m0.yaw, m1.yaw)) > 15, { from: m0.yaw, to: m1.yaw });
await send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: 160, y: 420, id: 1 }, { x: 230, y: 420, id: 2 }] });
for (let k = 1; k <= 10; k++) {
  await send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: 160 - 8 * k, y: 420, id: 1 }, { x: 230 + 8 * k, y: 420, id: 2 }] });
  await sleep(16);
}
await send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
await sleep(700);
const m2 = await panoState();
check('two fingers apart go closer', m2.fov < m1.fov - 10, { from: m1.fov, to: m2.fov });
await shot('pano-4-phone-turned.png');
await ev(`document.querySelector('.deck-pano [data-pano-close]').click()`, true);
await send('Emulation.setTouchEmulationEnabled', { enabled: false });
await send('Network.clearBrowserCookies');

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
await ev(`document.getElementById('bExport').click()`, true);
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
await send('Emulation.clearDeviceMetricsOverride');
ws.close();
console.log(failures ? `\n${failures} FAILED` : '\nall passed');
process.exit(failures ? 1 : 0);
