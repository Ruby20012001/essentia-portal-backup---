/* One editor's sitting on the IREO deck, against the local editor check (no
   live writes): the materials card, a sixteenth space with a picture and a pin,
   one more render in space 15, a save — then a reload, to see all of it again. */
import fs from 'node:fs';
const BASE = process.argv[2] || 'http://127.0.0.1:4189';
const DECK = 'd7114344-cacf-4396-9c79-412411268fa2';
const OUT = process.argv[3] || '.';
const sleep = (ms) => new Promise(r => setTimeout(r, ms));

const t = await (await fetch('http://127.0.0.1:9333/json/list')).json();
const page = t.find(x => x.type === 'page');
const ws = new WebSocket(page.webSocketDebuggerUrl);
await new Promise((r, j) => { ws.addEventListener('open', r); ws.addEventListener('error', j); });
let id = 0; const wait = new Map();
ws.addEventListener('message', (e) => { const m = JSON.parse(e.data); if (m.id && wait.has(m.id)) { wait.get(m.id)(m); wait.delete(m.id); } });
const send = (method, params) => new Promise(res => { id += 1; wait.set(id, res); ws.send(JSON.stringify({ id, method, params })); });
const ev = async (x) => {
  const m = await send('Runtime.evaluate', { expression: x, returnByValue: true, awaitPromise: true });
  if (m.result?.exceptionDetails) throw new Error('page threw: ' + (m.result.exceptionDetails.exception?.description || JSON.stringify(m.result.exceptionDetails)).slice(0, 500));
  return m.result?.result?.value;
};
const waitFor = async (expr, ms = 60000) => {
  const end = Date.now() + ms;
  while (Date.now() < end) { if (await ev(expr)) return true; await sleep(400); }
  throw new Error('timed out waiting for ' + expr);
};
/* The deck pane scrolls inside the page, so page coordinates mean nothing to
   it: make the window tall, bring the element to the top, and cut what shows. */
const shotOf = async (selectorExpr, file, pad = 12) => {
  await send("Emulation.setDeviceMetricsOverride", { width: 1400, height: 2600, deviceScaleFactor: 1, mobile: false });
  await sleep(700);
  const raw = await ev(`(function(){var el=${selectorExpr}; if(!el) return "null"; el.scrollIntoView({block:"start"}); var r=el.getBoundingClientRect(); return JSON.stringify({x:r.left,y:r.top,w:r.width,h:r.height,vh:innerHeight});})()`);
  await sleep(900);
  const box = JSON.parse(raw);
  if (box) {
    const top = Math.max(0, box.y - pad);
    const s = await send("Page.captureScreenshot", { format: "png",
      clip: { x: Math.max(0, box.x - pad), y: top, width: box.w + pad * 2, height: Math.min(box.h + pad * 2, box.vh - top), scale: 1 } });
    fs.writeFileSync(`${OUT}/${file}`, Buffer.from(s.result.data, "base64"));
    console.log("   wrote", file);
  } else console.log("no element for", file);
  await send("Emulation.setDeviceMetricsOverride", { width: 1400, height: 950, deviceScaleFactor: 1, mobile: false });
  await sleep(400);
};
let failures = 0;
const check = (label, ok, detail) => { console.log((ok ? '  ok   ' : '  FAIL ') + label + (detail !== undefined ? '  → ' + JSON.stringify(detail) : '')); if (!ok) failures++; };

await send('Page.enable', {});
await send('Network.clearBrowserCookies', {});
await send('Network.setCacheDisabled', { cacheDisabled: true });
await send('Emulation.setDeviceMetricsOverride', { width: 1400, height: 950, deviceScaleFactor: 1, mobile: false });

console.log('A · open as an editor');
await send('Page.navigate', { url: `${BASE}/deck/${DECK}` });
await waitFor(`!!(window.S && window.PORTAL && PORTAL.version && document.querySelector('#matList [data-mat]'))`);
await sleep(4000);
const a = await ev(`({
  reading: document.body.classList.contains('is-reading'),
  editPane: getComputedStyle(document.querySelector('.pane-edit')).display,
  signOut: !!document.getElementById('bSignOut'),
  rows: document.querySelectorAll('#matList [data-mat]').length,
  thumbs: [].filter.call(document.querySelectorAll('#matList img[data-swatch]'), function(i){return i.src.indexOf('data:image/jpeg')===0}).length,
  spaces: EssentiaDeck.live(S).length, version: PORTAL.version
})`);
check('editor pane is open, not reading', !a.reading && a.editPane !== 'none', a);
check('materials card lists the 8 materials', a.rows === 8, a.rows);
check('each has its swatch cut', a.thumbs === 8, a.thumbs);
check('the deck has 15 spaces to begin with', a.spaces === 15, a.spaces);
await shotOf(`document.getElementById('card-materials')`, 'sitting-1-materials-card.png');

console.log('B · the materials card');
const b = await ev(`(async function(){
  function row(name){ return [].filter.call(document.querySelectorAll('#matList [data-mat]'), function(r){ return r.querySelector('.row-title').textContent === name; })[0]; }
  function type(input, v){ input.value = v; input.dispatchEvent(new Event('input', {bubbles:true})); }
  type(row('Bianco Siena').querySelector('[data-mat-k="code"]'), 'BS-01');
  var nasoli = row('Nasoli Flower').querySelector('[data-mat-on]'); nasoli.click();
  document.getElementById('bAddMat').click();
  var rows = document.querySelectorAll('#matList [data-mat]'); var fresh = rows[rows.length-1];
  type(fresh.querySelector('[data-mat-k="name"]'), 'Essence');
  type(fresh.querySelector('[data-mat-k="code"]'), '32901001');
  type(fresh.querySelector('[data-mat-k="material"]'), 'Basin mixer');
  type(fresh.querySelector('[data-mat-k="brand"]'), 'Grohe');
  type(fresh.querySelector('[data-mat-k="where"]'), 'master bathroom');
  var c = document.createElement('canvas'); c.width = 400; c.height = 400; var g = c.getContext('2d');
  g.fillStyle = '#d8c4a8'; g.fillRect(0,0,400,400);
  for (var i=0;i<600;i++){ g.fillStyle='rgba(120,90,60,'+(Math.random()*0.15)+')'; g.fillRect(Math.random()*400,Math.random()*400,3,3); }
  var key = row('Canyon Beige').getAttribute('data-mat');
  matKept(key).sample = c.toDataURL('image/jpeg', 0.86); renderMaterials(); paint();
  await new Promise(function(r){ setTimeout(r, 1500); });
  var table = document.querySelector('#pane #materials');
  var trs = [].map.call(table.querySelectorAll('tbody tr'), function(tr){ return [].map.call(tr.children, function(td){ var im = td.querySelector('img'); return im ? (im.hasAttribute('data-swatch') ? 'cut:' + (im.src.indexOf('data:image/jpeg')===0) : 'photo') : td.childNodes[0] ? td.childNodes[0].textContent : td.textContent; }); });
  return { trs: trs, cardRows: document.querySelectorAll('#matList [data-mat]').length, nasoliOff: row('Nasoli Flower').classList.contains('row--off') };
})()`);
const byName = Object.fromEntries(b.trs.map(r => [r[0], r]));
check('the deck lists 8 rows: one taken off, one added', b.trs.length === 8, b.trs.map(r => r[0]));
check('Bianco Siena carries the code typed', byName['Bianco Siena']?.[1] === 'BS-01', byName['Bianco Siena']);
check('Nasoli Flower is off the deck, still in the card', !byName['Nasoli Flower'] && b.nasoliOff && b.cardRows === 9, { cardRows: b.cardRows });
check('the added material reads across', JSON.stringify(byName['Essence']) === JSON.stringify(['Essence', '32901001', 'Basin mixer', '', '—', 'Grohe']), byName['Essence']);
check('Canyon Beige shows the sample photo, not a cut', byName['Canyon Beige']?.[3] === 'photo', byName['Canyon Beige']);
await shotOf(`document.querySelector('#pane #materials')`, 'sitting-2-deck-materials-edited.png');

console.log('C · a sixteenth space, and one more render for 15');
const c = await ev(`(async function(){
  function pic(w, h, label, hue){
    var c = document.createElement('canvas'); c.width = w; c.height = h; var g = c.getContext('2d');
    var gr = g.createLinearGradient(0,0,w,h); gr.addColorStop(0,'hsl('+hue+',30%,72%)'); gr.addColorStop(1,'hsl('+hue+',25%,38%)');
    g.fillStyle = gr; g.fillRect(0,0,w,h);
    for (var i=0;i<4000;i++){ g.fillStyle='rgba(0,0,0,'+(Math.random()*0.08)+')'; g.fillRect(Math.random()*w,Math.random()*h,4,4); }
    g.fillStyle = '#fff'; g.font = 'bold 160px sans-serif'; g.fillText(label, 80, 260);
    return c.toDataURL('image/jpeg', 0.82);
  }
  document.getElementById('bAddSpace').click();
  var rows = document.querySelectorAll('#spaces [data-space-row]');
  var nameIn = rows[rows.length-1].querySelector('input[data-k="name"]');
  nameIn.value = 'utility'; nameIn.dispatchEvent(new Event('input', {bubbles:true}));
  var sp = S.spaces[S.spaces.length-1];
  sp.images.push({ src: pic(1500, 1000, 'utility', 200), w: 1500, h: 1000 });
  sp.plate = 0; sp.x = 0.86; sp.y = 0.62;
  var fifteen = EssentiaDeck.live(S)[14];
  var real15 = S.spaces.filter(function(s){ return String(s.id) === String(fifteen.id); })[0];
  var before = real15.images.length;
  real15.images.push({ src: pic(1500, 1000, 'new 15', 30), w: 1500, h: 1000 });
  renderAll();
  await new Promise(function(r){ setTimeout(r, 1200); });
  var live = EssentiaDeck.live(S);
  var pins = [].map.call(document.querySelectorAll('#pane .deck-pin'), function(p){ return p.textContent.trim(); });
  return { count: live.length, last: { no: live[live.length-1].no, name: live[live.length-1].name, rev: live[live.length-1].images[0].rev },
           fifteen: { name: fifteen.name, revs: real15.images.map(function(im){ return im.rev; }), before: before },
           pins: pins.length, pin16: pins.indexOf('16') >= 0,
           inlineNow: newPictures(S).length };
})()`);
check('the new space is number 16, on its own', c.count === 16 && c.last.no === '16', c.last);
check('its picture is numbered after the space', c.last.rev === 'R16', c.last.rev);
check('the plan carries a 16th pin', c.pins === 16 && c.pin16, { pins: c.pins });
check('space 15 keeps its number; the new render counts down after the others', c.fifteen.revs[c.fifteen.revs.length - 1] === 'R' + String(15 - c.fifteen.before).padStart(2, '0'), c.fifteen);
check('three new pictures are waiting to go up (sample, utility, new 15)', c.inlineNow === 3, c.inlineNow);
await shotOf(`document.querySelector('#pane .deck-plate')`, 'sitting-3-plan-16.png');

console.log('D · save');
await ev(`document.getElementById('bBackup').click()`);
await waitFor(`window.PORTAL && PORTAL.busy === false && /Saved|Not saved|Somebody/.test((document.getElementById('backupState')||document.body).textContent)`, 90000).catch(() => {});
await sleep(800);
const d = await ev(`(async function(){
  var w = await (await fetch('/__writes')).json();
  var utility = S.spaces[S.spaces.length-1];
  return { writes: w, version: PORTAL.version, busy: PORTAL.busy,
    say: (document.getElementById('backupState') || {}).textContent,
    utilitySrc: utility.images[0].src.slice(0, 60),
    stillInline: newPictures(S).length,
    activity: (S.activity || []).slice(-1)[0] };
})()`);
const pics = d.writes.filter(x => x.what === 'picture');
const save = d.writes.filter(x => x.what === 'save');
check('each new picture went up on its own, once', pics.length === 3, pics.map(p => p.slot));
check('then one save', save.length === 1, save.map(s => ({ bodyKB: Math.round(s.bodyBytes / 1024), inline: s.inlinePictures, version: s.version })));
check('the save carries no new picture inside it (only the logo it always has)', save[0] && save[0].inlinePictures <= 1, save[0] && save[0].inlinePictures);
check('the save is light', save[0] && save[0].bodyBytes < 400 * 1024, save[0] && Math.round(save[0].bodyBytes / 1024) + ' KB');
check('the deck now points at the uploaded picture', /^\/api\/decks\/.+\/images\/pic%3A[0-9a-f]{32}$/.test(d.utilitySrc) || d.utilitySrc.indexOf('/api/decks/') === 0, d.utilitySrc);
check('nothing is left waiting', d.stillInline === 0, d.stillInline);
check('the activity says what was done', !!(d.activity && d.activity.did && d.activity.did.join(' | ').match(/utility/) && d.activity.did.join(' | ').match(/materials list/)), d.activity && d.activity.did);
console.log('   status line:', d.say);

console.log('E · reload — is it all still there');
await send('Page.navigate', { url: `${BASE}/deck/${DECK}` });
await waitFor(`!!(window.S && window.PORTAL && PORTAL.version && document.querySelector('#pane #materials'))`);
await sleep(6000);
const e = await ev(`(async function(){
  var live = EssentiaDeck.live(S);
  var last = live[live.length-1];
  var probe = function(src){ return new Promise(function(r){ var i = new Image(); i.onload = function(){ r(i.naturalWidth); }; i.onerror = function(){ r(0); }; i.src = src; }); };
  var table = document.querySelector('#pane #materials');
  var trs = [].map.call(table.querySelectorAll('tbody tr'), function(tr){ var im = tr.querySelector('img'); return [tr.children[0].childNodes[0].textContent, tr.children[1].textContent, im && !im.hasAttribute('data-swatch') ? im.getAttribute('src').slice(0, 40) : 'cut']; });
  var canyon = trs.filter(function(r){ return r[0] === 'Canyon Beige'; })[0];
  return { version: PORTAL.version, count: live.length, last: { no: last.no, name: last.name, rev: last.images[0].rev, src: last.images[0].src.slice(0, 70) },
           width: await probe(last.images[0].src),
           canyonWidth: canyon && canyon[2] !== 'cut' ? await probe(canyon[2].indexOf('/api/') === 0 ? S.materials.filter(function(m){ return m.sample; })[0].sample : '') : 0,
           trs: trs,
           pins: document.querySelectorAll('#pane .deck-pin').length };
})()`);
check('reopened at the saved version', e.version === d.version, e.version);
check('16 spaces, the last one utility, number 16', e.count === 16 && e.last.no === '16' && e.last.name === 'utility', e.last);
check('its picture comes back from the picture route', e.width === 1500, e.width);
check('16 pins on the plan', e.pins === 16, e.pins);
check('the materials edits survived', e.trs.length === 8 && e.trs.some(r => r[0] === 'Bianco Siena' && r[1] === 'BS-01') && e.trs.some(r => r[0] === 'Essence') && !e.trs.some(r => r[0] === 'Nasoli Flower'), e.trs.map(r => r[0] + ':' + r[1]));
check('the sample photo comes back from the picture route', e.canyonWidth > 0, e.canyonWidth);
await shotOf(`document.querySelector('#pane .deck-plate')`, 'sitting-4-plan-16-after-reload.png');
await shotOf(`document.querySelector('#pane #materials')`, 'sitting-5-materials-after-reload.png');

await send('Emulation.clearDeviceMetricsOverride', {});
ws.close();
console.log(failures ? `\n${failures} FAILED` : '\nall passed');
process.exit(failures ? 1 : 0);
