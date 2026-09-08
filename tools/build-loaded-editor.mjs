/**
 * The editor, opening on a deck that is already full.
 *
 *   node tools/build-loaded-editor.mjs <configurator.html> <builtDeck.html> <out.html>
 *
 * The tool ships opening on a sample that carries the plan, the pins and the
 * writing but no renders — they are five and a half megabytes, and a tool
 * nobody has opened yet should not weigh that. That is right for a new project
 * and wrong for the one already finished: marking materials on IREO's own
 * renders means having IREO's own renders in the editor.
 *
 * So this takes a built deck, puts its pictures back into its own state — the
 * deck holds each picture once, in the markup, and the state alongside it has
 * the src stripped out — and writes a copy of the tool that opens on all of it.
 */
import fs from 'node:fs';
import path from 'node:path';

const [toolPath, deckPath, out] = process.argv.slice(2);
const tool = fs.readFileSync(toolPath, 'utf8');
const deck = fs.readFileSync(deckPath, 'utf8');

/* the state the deck carries, with every src emptied */
const from = deck.indexOf('window.__DECK__=') + 'window.__DECK__='.length;
const to = deck.indexOf(';<\/script>', from) >= 0
  ? deck.indexOf(';<\/script>', from)
  : deck.indexOf(';</script>', from);
const state = JSON.parse(deck.slice(from, to).split('<\\/').join('</'));

/* and the pictures themselves, out of the markup they are written into */
const imgs = [...deck.matchAll(/<img[^>]+src="(data:[^"]+)"[^>]*>/g)].map((m) => m[0]);
const attr = (tag, name) => (tag.match(new RegExp(name + '="([^"]*)"')) || [])[1];
const srcOf = (tag) => (tag.match(/src="(data:[^"]+)"/) || [])[1];

const byId = {};
(state.spaces || []).forEach((s) => { byId[String(s.id)] = s; });

let put = 0;
for (const tag of imgs) {
  const src = srcOf(tag);
  if (!src) continue;
  if (attr(tag, 'data-logo') !== undefined && /data-logo/.test(tag)) { state.logo = state.logo || src; put++; continue; }
  const plate = attr(tag, 'data-plate-img');
  if (plate !== undefined) { const p = (state.plates || [])[+plate]; if (p && !p.src) { p.src = src; put++; } continue; }
  const doc = attr(tag, 'data-doc');
  if (doc !== undefined) { const d = (state.documents || [])[+doc]; if (d && !d.src) { d.src = src; put++; } continue; }
  const sp = attr(tag, 'data-sp');
  if (sp !== undefined) {
    const s = byId[sp], k = +attr(tag, 'data-ix');
    if (s && s.images && s.images[k] && !s.images[k].src) { s.images[k].src = src; put++; }
    continue;
  }
  const spdoc = attr(tag, 'data-spdoc');
  if (spdoc !== undefined) {
    const s = byId[spdoc], k = +attr(tag, 'data-ix');
    if (s && s.docs && s.docs[k] && !s.docs[k].src) { s.docs[k].src = src; put++; }
  }
}
if (!state.logo) {
  const mark = deck.match(/<img[^>]+data-print-logo[^>]+src="(data:[^"]+)"/);
  if (mark) state.logo = mark[1];
}

/* the tool opens on whatever SAMPLE_STATE holds */
const at = tool.indexOf('\nvar SAMPLE_STATE = ');
if (at < 0) throw new Error('SAMPLE_STATE not found in the tool');
const end = tool.indexOf(';\r\n', at) >= 0 ? tool.indexOf(';\r\n', at) : tool.indexOf(';\n', at);
const loaded = tool.slice(0, at + '\nvar SAMPLE_STATE = '.length) +
  JSON.stringify(state).replace(/<\//g, '<\\/') +
  tool.slice(end);

fs.mkdirSync(path.dirname(out), { recursive: true });
fs.writeFileSync(out, loaded);

const shots = (state.spaces || []).reduce((n, s) => n + ((s.images || []).length), 0);
console.log('wrote', out, (loaded.length / 1048576).toFixed(2) + ' MB');
console.log('pictures put back:', put, '· spaces:', (state.spaces || []).length, '· renders:', shots);
console.log('plan:', (state.plates || []).map((p) => (p.src ? p.label : p.label + ' (none)')).join(' | '));
