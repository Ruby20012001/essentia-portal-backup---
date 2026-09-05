/**
 * Cuts a delivery copy of the tool with the build time written into it, so the
 * version is readable in the header the moment it opens — no scrolling, no
 * guessing which of several downloads is the current one.
 *
 *   node tools/stamp-build.mjs tools/concept-deck-configurator.html <outDir>
 */
import fs from 'node:fs';
import path from 'node:path';

const [src, outDir] = process.argv.slice(2);
const d = new Date();
const MON = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
const stamp = String(d.getDate()).padStart(2, '0') + MON[d.getMonth()] +
  '-' + String(d.getHours()).padStart(2, '0') + String(d.getMinutes()).padStart(2, '0');

const html = fs.readFileSync(src, 'utf8');
if (!html.includes('__TOOL_BUILD__')) throw new Error('no __TOOL_BUILD__ placeholder in ' + src);

const out = path.join(outDir, path.basename(src, '.html') + '-' + stamp + '.html');
fs.mkdirSync(outDir, { recursive: true });
fs.writeFileSync(out, html.split('__TOOL_BUILD__').join(stamp));
console.log(out);
console.log('stamp', stamp);
